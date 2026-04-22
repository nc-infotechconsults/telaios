from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional

from langchain_core.messages import (
    AIMessage,
    AnyMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import StructuredTool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Command, interrupt
from pydantic import BaseModel
from typing_extensions import TypedDict

from agent_service.config import config
from agent_service.core.llm import build_chat_model
from agent_service.services import data_client, sse_manager
from agent_service.services.repo_explorer import (
    ensure_local_path,
    list_directory,
    read_file,
    search_code,
)

logger = logging.getLogger(__name__)

# ─── Checkpointer ─────────────────────────────────────────────────────────────

_checkpointer: Any = None
_graph: Any = None


def set_checkpointer(c: Any) -> None:
    global _checkpointer, _graph
    _checkpointer = c
    _graph = _build_graph()
    logger.info("Planning service: checkpointer set and graph compiled.")


def _get_checkpointer() -> Any:
    return _checkpointer


# ─── State ────────────────────────────────────────────────────────────────────


class PlannerState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    plan_id: str
    project_id: str
    plan_title: Optional[str]
    project_context: Optional[Dict[str, Any]]
    repos: List[Dict[str, Any]]
    planner_agent: Optional[Dict[str, Any]]
    phase: str  # "interview" | "review"
    plan_draft: Optional[Dict[str, Any]]


# ─── Domain types ─────────────────────────────────────────────────────────────


class PlannedTask:
    def __init__(self, data: Dict[str, Any]) -> None:
        self.title: str = data["title"]
        self.description: str = data.get("description", "")
        self.type: str = data.get("type", "general")
        self.execution_order: int = data.get("execution_order", 0)
        self.depends_on_task_indices: List[int] = data.get(
            "depends_on_task_indices", []
        )
        self.repository_ids: List[str] = data.get("repository_ids", [])


# ─── Streaming helpers ────────────────────────────────────────────────────────


async def _stream_message_chunks(plan_id: str, text: str) -> None:
    chunks = re.findall(r"\S+\s*", text) or [text]
    for chunk in chunks:
        sse_manager.broadcast(plan_id, {"type": "chat_token", "content": chunk})
        await asyncio.sleep(0.018)


# ─── Task persistence ─────────────────────────────────────────────────────────


async def _save_draft_tasks(
    plan_id: str, planned_tasks: List[PlannedTask]
) -> List[Dict[str, Any]]:
    """
    Persist draft tasks to the DB, replacing any existing ones.

    Two-pass strategy:
      Pass 1 — create all tasks without dependencies to obtain their real UUIDs.
      Pass 2 — patch tasks that have dependencies, resolving index references to UUIDs.
    """
    await data_client.delete_tasks_by_plan(plan_id)

    saved = await asyncio.gather(
        *[
            data_client.create_task(
                {
                    "plan_id": plan_id,
                    "title": t.title,
                    "description": t.description or "",
                    "type": t.type or "general",
                    "status": "pending",
                    "execution_order": (
                        t.execution_order if t.execution_order is not None else i
                    ),
                    "repository_ids": t.repository_ids or [],
                }
            )
            for i, t in enumerate(planned_tasks)
        ]
    )

    id_by_index = [t["id"] for t in saved]
    await asyncio.gather(
        *[
            data_client.update_task(
                saved[i]["id"],
                {
                    "depends_on_task_ids": [
                        id_by_index[idx]
                        for idx in (t.depends_on_task_indices or [])
                        if idx < len(id_by_index)
                    ]
                },
            )
            for i, t in enumerate(planned_tasks)
            if t.depends_on_task_indices
        ]
    )

    return await data_client.get_plan_tasks(plan_id)


def _build_plan_payload(
    plan_id: str, state: PlannerState, saved_tasks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    return {
        "id": plan_id,
        "project_id": state["project_id"],
        "title": state.get("plan_title"),
        "status": "draft",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tasks": saved_tasks,
    }


# ─── LLM response parser ──────────────────────────────────────────────────────


def _parse_planner_response(text: str) -> Optional[Dict[str, Any]]:
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
        if not isinstance(parsed.get("message"), str):
            return None
        return {
            "message": parsed["message"],
            "ready_for_plan": bool(parsed.get("ready_for_plan", False)),
            "plan": parsed.get("plan"),
        }
    except Exception:
        return None


# ─── Repo tools ───────────────────────────────────────────────────────────────


def _build_repo_tools(
    repos: List[Dict[str, Any]], project_id: str
) -> List[StructuredTool]:
    if not repos:
        return []

    local_path_cache: Dict[str, str] = {}

    async def _get_path(repo_name: str) -> Optional[str]:
        if repo_name in local_path_cache:
            return local_path_cache[repo_name]
        repo = next((r for r in repos if r["name"] == repo_name), None)
        if not repo:
            return None
        try:
            p = await ensure_local_path(repo, project_id)
            local_path_cache[repo_name] = p
            return p
        except Exception:
            return None

    repo_names = ", ".join(r["name"] for r in repos)

    async def list_dir_fn(repo: str, path: str = "") -> str:
        local = await _get_path(repo)
        if not local:
            return f'Repository "{repo}" could not be accessed. Available: {repo_names}'
        return list_directory(local, path)

    async def read_file_fn(repo: str, path: str) -> str:
        local = await _get_path(repo)
        if not local:
            return f'Repository "{repo}" could not be accessed. Available: {repo_names}'
        return read_file(local, path)

    async def search_code_fn(repo: str, pattern: str, file_glob: str = "*") -> str:
        local = await _get_path(repo)
        if not local:
            return f'Repository "{repo}" could not be accessed. Available: {repo_names}'
        return search_code(local, pattern, file_glob)

    class ListDirInput(BaseModel):
        repo: str
        path: str = ""

    class ReadFileInput(BaseModel):
        repo: str
        path: str

    class SearchCodeInput(BaseModel):
        repo: str
        pattern: str
        file_glob: str = "*"

    return [
        StructuredTool.from_function(
            coroutine=list_dir_fn,
            name="list_directory",
            description=(
                f"List files and subdirectories at a path inside a project repository. "
                f"Available repos: {repo_names}. "
                f"Use this to explore the project structure. Start with an empty path to see the root."
            ),
            args_schema=ListDirInput,
        ),
        StructuredTool.from_function(
            coroutine=read_file_fn,
            name="read_file",
            description=(
                f"Read the contents of a file inside a project repository. "
                f"Available repos: {repo_names}. "
                f"Use this to read package.json, config files, entry points, schemas, etc."
            ),
            args_schema=ReadFileInput,
        ),
        StructuredTool.from_function(
            coroutine=search_code_fn,
            name="search_code",
            description=(
                f"Search for a text pattern across repository files (like grep -r). "
                f"Available repos: {repo_names}. "
                f"Use this to find implementations, locate configs, or discover patterns."
            ),
            args_schema=SearchCodeInput,
        ),
    ]


# ─── Project context ──────────────────────────────────────────────────────────


def _scan_repo_structure(root_path: str, max_depth: int = 3) -> str:
    IGNORE = frozenset(
        [
            ".git",
            "node_modules",
            "__pycache__",
            ".next",
            "dist",
            "build",
            ".venv",
            "venv",
            ".mypy_cache",
            ".pytest_cache",
            "coverage",
            ".turbo",
            ".cache",
            "vendor",
        ]
    )

    lines: list[str] = []

    def walk(directory: str, depth: int, prefix: str) -> None:
        if depth > max_depth:
            return
        try:
            entries = sorted(
                os.scandir(directory),
                key=lambda e: (not e.is_dir(), e.name.lower()),
            )
        except Exception:
            return
        filtered = [
            e for e in entries if e.name not in IGNORE and not e.name.startswith(".")
        ]
        cap = filtered[:60]
        for i, entry in enumerate(cap):
            is_last = i == len(cap) - 1
            connector = "└── " if is_last else "├── "
            child_prefix = prefix + ("    " if is_last else "│   ")
            suffix = "/" if entry.is_dir() else ""
            lines.append(f"{prefix}{connector}{entry.name}{suffix}")
            if entry.is_dir():
                walk(entry.path, depth + 1, child_prefix)
        if len(filtered) > 60:
            lines.append(f"{prefix}... ({len(filtered) - 60} more)")

    lines.append(os.path.basename(root_path) + "/")
    walk(root_path, 1, "")
    return "\n".join(lines)


async def _gather_project_context(
    project_id: str, current_plan_id: str
) -> Dict[str, Any]:
    project, all_plans, repos, documents = await asyncio.gather(
        data_client.get_project(project_id),
        data_client.get_project_plans(project_id),
        data_client.get_project_repositories(project_id),
        data_client.list_project_documents(project_id),
    )

    existing_plans = [
        {"title": p.get("title"), "status": p["status"]}
        for p in all_plans
        if p["id"] != current_plan_id
    ]

    repo_structures = []
    for r in repos:
        structure = "(not yet cloned)"
        if r.get("local_path") and os.path.exists(r["local_path"]):
            try:
                structure = _scan_repo_structure(r["local_path"])
            except Exception:
                structure = "(unable to scan)"
        repo_structures.append({"name": r["name"], "structure": structure})

    ready_docs = [
        {
            "name": d.get("name", ""),
            "file_type": d.get("file_type", ""),
            "size_bytes": d.get("size_bytes", 0),
        }
        for d in documents
        if d.get("status") == "ready"
    ]

    return {
        "name": project["name"],
        "description": project.get("description"),
        "existingPlans": existing_plans,
        "repoStructures": repo_structures,
        "documents": ready_docs,
    }


def _build_project_context_text(ctx: Dict[str, Any], plan_title: Optional[str]) -> str:
    lines: list[str] = []
    lines.append(f"Project: {ctx['name']}")
    if ctx.get("description"):
        lines.append(f"Description: {ctx['description']}")

    if ctx.get("existingPlans"):
        lines.append(
            "\nExisting plans for this project (do NOT duplicate their scope):"
        )
        for p in ctx["existingPlans"]:
            lines.append(f'  - "{p["title"] or "(untitled)"}" [{p["status"]}]')

    if plan_title:
        lines.append(f'\nThis plan is titled: "{plan_title}"')

    if ctx.get("repoStructures"):
        lines.append("\nRepository file structure(s):")
        for r in ctx["repoStructures"]:
            lines.append(f"\n### {r['name']}\n```\n{r['structure']}\n```")

    docs = ctx.get("documents", [])
    if docs:
        lines.append(
            "\nProject documents (already uploaded and indexed — "
            "reference them in task descriptions when relevant):"
        )
        for d in docs:
            size_kb = round(d.get("size_bytes", 0) / 1024, 1)
            lines.append(
                f"  - {d['name']} ({d.get('file_type', 'unknown')}, {size_kb} KB)"
            )

    return "\n".join(lines)


# ─── Prompts ──────────────────────────────────────────────────────────────────

BASE_SYSTEM = (
    "You are an expert software project planning assistant. "
    "Your job is to interview the user to understand what they want to build, "
    "then produce a detailed, dependency-ordered execution plan."
)

TASK_SCHEMA = (
    '{"title":"string","description":"string","type":"code|test|review|general",'
    '"execution_order":0,"depends_on_task_indices":[],'
    '"repository_ids":["repo_uuid"]}'
)

STRUCTURED_OUTPUT_INSTRUCTIONS = (
    "\n\nCRITICAL: Always respond with ONLY valid JSON — no markdown, no extra text:\n"
    '{"message":"<natural language reply>","ready_for_plan":false,"plan":null}\n\n'
    "When you have gathered enough information to build a complete plan, set ready_for_plan to true "
    "and include the full plan in the same response:\n"
    f'{{"message":"<brief plan summary for the user>","ready_for_plan":true,"plan":{{"tasks":[{TASK_SCHEMA}]}}}}\n\n'
    "Plan rules:\n"
    "- depends_on_task_indices are 0-based indices into the tasks array\n"
    "- execution_order starts at 0 and increases"
)


def _build_greeting(title: Optional[str]) -> str:
    if title:
        return (
            f"Hello! I'm your AI planning assistant. I'll help you build a detailed execution plan for **{title}**.\n\n"
            "Describe what you want to achieve, any constraints, and technical requirements."
        )
    return (
        "Hello! I'm your AI planning assistant. I'll help you break down "
        "this feature into an actionable execution plan.\n\n"
        "Tell me: **what are you building?** You can describe it at any level of detail — we'll refine together."
    )


# ─── LLM factory ──────────────────────────────────────────────────────────────


def _build_llm(
    settings: Dict[str, Any], planner_agent: Optional[Dict[str, Any]]
) -> Any:
    if planner_agent and planner_agent.get("llm_provider"):
        from agent_service.crypto import decrypt as _decrypt

        raw_key = planner_agent.get("llm_api_key", "")
        api_key = (
            _decrypt(raw_key) if raw_key else (settings.get("llm_api_key_raw") or "")
        )
        return build_chat_model(
            provider=planner_agent.get("llm_provider") or settings["llm_provider"],
            model=planner_agent.get("llm_model") or settings["llm_model"],
            api_key=api_key,
            base_url=planner_agent.get("llm_base_url") or settings.get("llm_base_url"),
            temperature=planner_agent.get("llm_temperature"),
            max_tokens=planner_agent.get("llm_max_tokens"),
            top_p=planner_agent.get("llm_top_p"),
            frequency_penalty=planner_agent.get("llm_frequency_penalty"),
            presence_penalty=planner_agent.get("llm_presence_penalty"),
        )
    return build_chat_model(
        provider=settings["llm_provider"],
        model=settings["llm_model"],
        api_key=settings.get("llm_api_key_raw") or "",
        base_url=settings.get("llm_base_url"),
    )


# ─── System prompt builders ───────────────────────────────────────────────────


def _build_interview_system(
    state: PlannerState,
    planner_agent: Optional[Dict[str, Any]],
    tools: List[StructuredTool],
) -> str:
    repos = state.get("repos", [])
    repos_text = (
        "\n".join(
            f"- id:{r['id']} name:{r['name']} url:{r.get('remote_url', '(local)')}"
            for r in repos
        )
        or "None configured yet."
    )

    context_block = ""
    if state.get("project_context"):
        context_block = "\n\n## Project Context\n" + _build_project_context_text(
            state["project_context"], state.get("plan_title")
        )

    tools_note = (
        "\n\nYou have tools to explore the repository filesystem (list_directory, read_file, search_code). "
        "Use them proactively to understand the codebase structure, dependencies, and conventions BEFORE asking the user questions. "
        "Only ask the user what you cannot discover from the code."
        if tools
        else ""
    )

    base_content = (
        BASE_SYSTEM
        + context_block
        + f"\n\nProject repositories (use these IDs in task repository_ids):\n{repos_text}"
        + tools_note
        + "\n\nUse the project context above to ask targeted follow-up questions and avoid duplicating existing work. "
        "Ask ONE focused follow-up question at a time. "
        "Set ready_for_plan to true only when you have enough information for a complete plan."
        + STRUCTURED_OUTPUT_INSTRUCTIONS
    )

    if planner_agent and planner_agent.get("system_prompt"):
        custom = planner_agent["system_prompt"]
        mode = planner_agent.get("system_prompt_mode") or "override"
        if mode == "override":
            return custom + STRUCTURED_OUTPUT_INSTRUCTIONS
        return base_content + "\n\n" + custom

    return base_content


def _build_review_system(
    state: PlannerState, planner_agent: Optional[Dict[str, Any]]
) -> str:
    repos = state.get("repos", [])
    repos_text = "\n".join(f"- id:{r['id']} name:{r['name']}" for r in repos) or "none"

    context_block = ""
    if state.get("project_context"):
        context_block = "\n\n## Project Context\n" + _build_project_context_text(
            state["project_context"], state.get("plan_title")
        )

    base_system = (
        BASE_SYSTEM
        + context_block
        + "\n\nThe user wants to revise the current plan."
        + f"\n\nCurrent plan:\n{json.dumps(state.get('plan_draft'), indent=2, default=str)}"
        + f"\n\nAvailable repositories (use these IDs in task repository_ids):\n{repos_text}"
        + "\n\nApply the user's requested changes and return the updated plan. Always set ready_for_plan to true."
        + STRUCTURED_OUTPUT_INSTRUCTIONS
    )

    if planner_agent and planner_agent.get("system_prompt"):
        custom = planner_agent["system_prompt"]
        mode = planner_agent.get("system_prompt_mode") or "override"
        if mode == "override":
            return custom + STRUCTURED_OUTPUT_INSTRUCTIONS
        return base_system + "\n\n" + custom

    return base_system


# ─── Graph nodes ──────────────────────────────────────────────────────────────


async def prepare_node(state: PlannerState) -> Dict[str, Any]:
    """
    Load plan context from DB (once) and send greeting on first visit.
    On reconnect (project_id already in state), returns immediately.
    """
    plan_id = state["plan_id"]

    if state.get("project_id"):
        # Already initialized — reconnect, nothing to do.
        return {}

    try:
        plan = await data_client.get_plan(plan_id)
    except Exception as exc:
        logger.error("prepare_node: could not load plan %s: %s", plan_id, exc)
        return {}

    project_id = plan["project_id"]
    plan_title = plan.get("title")

    repos, project_context, project_agents_raw = await asyncio.gather(
        data_client.get_project_repositories(project_id),
        _gather_project_context(project_id, plan_id),
        data_client.get_project_agents_raw(project_id),
    )

    planner_agent = next(
        (pa for pa in project_agents_raw if pa.get("role") == "planner"), None
    )

    greeting = _build_greeting(plan_title)

    # Save greeting to DB (fire-and-forget)
    asyncio.create_task(
        data_client.save_message(
            {
                "project_id": project_id,
                "plan_id": plan_id,
                "role": "assistant",
                "content": greeting,
            }
        )
    )

    # Brief pause to let the SSE queue be created before broadcasting.
    await asyncio.sleep(0.15)
    sse_manager.broadcast(plan_id, {"type": "chat_token", "content": greeting})
    sse_manager.broadcast(plan_id, {"type": "chat_end"})

    return {
        "project_id": project_id,
        "plan_title": plan_title,
        "repos": repos,
        "project_context": project_context,
        "planner_agent": planner_agent,
        "phase": "interview",
        "messages": [AIMessage(content=greeting)],
    }


async def interview_wait_node(state: PlannerState) -> Dict[str, Any]:
    """Interrupt: wait for user message during interview phase."""
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    user_content: str = interrupt("Waiting for user message")
    trimmed = user_content.strip()

    asyncio.create_task(
        data_client.save_message(
            {
                "project_id": project_id,
                "plan_id": plan_id,
                "role": "user",
                "content": trimmed,
            }
        )
    )
    sse_manager.broadcast(plan_id, {"type": "chat_thinking"})

    return {"messages": [HumanMessage(content=trimmed)]}


async def planner_node(state: PlannerState) -> Dict[str, Any]:
    """
    Run LLM (with repo tools). Returns the AI response.
    Streams message tokens if this is a final response (no tool calls).
    """
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    settings = await data_client.get_settings()
    planner_agent = state.get("planner_agent")
    repos = state.get("repos", [])
    tools = _build_repo_tools(repos, project_id)

    llm = _build_llm(settings, planner_agent)
    system_content = _build_interview_system(state, planner_agent, tools)
    messages = [SystemMessage(content=system_content)] + list(state["messages"])

    llm_with_tools = llm.bind_tools(tools) if tools else llm
    response = await llm_with_tools.ainvoke(messages)

    tool_calls = getattr(response, "tool_calls", None) or []

    if tool_calls:
        # Broadcast tool-use events and let tools_node handle execution.
        for tc in tool_calls:
            sse_manager.broadcast(
                plan_id,
                {
                    "type": "chat_tool_use",
                    "tool": tc["name"],
                    "input": tc.get("args", {}),
                },
            )
    else:
        # Final response — stream tokens and save to DB.
        text = (
            response.content
            if isinstance(response.content, str)
            else json.dumps(response.content)
        )
        parsed = _parse_planner_response(text)
        msg_text = parsed["message"] if parsed else text

        asyncio.create_task(
            data_client.save_message(
                {
                    "project_id": project_id,
                    "plan_id": plan_id,
                    "role": "assistant",
                    "content": msg_text,
                }
            )
        )
        await _stream_message_chunks(plan_id, msg_text)

        # chat_end is sent here unless we're about to emit plan_draft.
        if not (parsed and parsed.get("ready_for_plan") and parsed.get("plan")):
            sse_manager.broadcast(plan_id, {"type": "chat_end"})

    return {"messages": [response]}


async def tools_node(state: PlannerState) -> Dict[str, Any]:
    """Execute tool calls from the last AI message."""
    repos = state.get("repos", [])
    project_id = state["project_id"]

    tools = _build_repo_tools(repos, project_id)
    tool_map = {t.name: t for t in tools}

    last_ai = state["messages"][-1]
    tool_calls = getattr(last_ai, "tool_calls", []) or []

    tool_results: List[ToolMessage] = []
    for tc in tool_calls:
        tool = tool_map.get(tc["name"])
        try:
            result = (
                str(await tool.ainvoke(tc["args"]))
                if tool
                else f"Unknown tool: {tc['name']}"
            )
        except Exception as exc:
            result = f"Tool error: {exc}"
        tool_results.append(ToolMessage(content=result, tool_call_id=tc["id"]))

    return {"messages": tool_results}


async def save_draft_node(state: PlannerState) -> Dict[str, Any]:
    """
    Parse plan from the last AI message, save draft tasks, and broadcast plan_draft.
    """
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    # Find the last non-tool-call AI message.
    last_ai = next(
        (
            m
            for m in reversed(state["messages"])
            if isinstance(m, AIMessage) and not getattr(m, "tool_calls", None)
        ),
        None,
    )

    saved_tasks: List[Dict[str, Any]] = []

    if last_ai:
        text = last_ai.content if isinstance(last_ai.content, str) else ""
        parsed = _parse_planner_response(text)
        if parsed and parsed.get("plan"):
            planned_tasks = [PlannedTask(t) for t in parsed["plan"].get("tasks", [])]
            saved_tasks = await _save_draft_tasks(plan_id, planned_tasks)

    sse_manager.broadcast(
        plan_id,
        {
            "type": "plan_draft",
            "plan": _build_plan_payload(plan_id, state, saved_tasks),
        },
    )
    sse_manager.broadcast(plan_id, {"type": "chat_end"})

    return {
        "phase": "review",
        "plan_draft": {"tasks": saved_tasks},
    }


async def review_wait_node(state: PlannerState) -> Dict[str, Any]:
    """Interrupt: wait for user message during review phase."""
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    user_content: str = interrupt("Waiting for review response")
    trimmed = user_content.strip()

    asyncio.create_task(
        data_client.save_message(
            {
                "project_id": project_id,
                "plan_id": plan_id,
                "role": "user",
                "content": trimmed,
            }
        )
    )
    sse_manager.broadcast(plan_id, {"type": "chat_thinking"})

    return {"messages": [HumanMessage(content=trimmed)]}


async def confirm_node(state: PlannerState) -> Dict[str, Any]:
    """Confirm plan, mark root tasks as ready, and trigger execution."""
    from agent_service.services.execution_service import start_execution

    plan_id = state["plan_id"]
    project_id = state["project_id"]

    plan = await data_client.update_plan(
        plan_id,
        {"status": "confirmed", "confirmed_at": datetime.now(timezone.utc).isoformat()},
    )

    tasks = await data_client.get_plan_tasks(plan_id)
    await asyncio.gather(
        *[
            data_client.update_task(t["id"], {"status": "ready"})
            for t in tasks
            if not t.get("depends_on_task_ids")
        ]
    )

    confirm_msg = "✅ Plan confirmed and saved! Execution will begin shortly."
    asyncio.create_task(
        data_client.save_message(
            {
                "project_id": project_id,
                "plan_id": plan_id,
                "role": "assistant",
                "content": confirm_msg,
            }
        )
    )
    await _stream_message_chunks(plan_id, confirm_msg)
    sse_manager.broadcast(plan_id, {"type": "plan_confirmed", "plan_id": plan["id"]})

    asyncio.create_task(start_execution(project_id, plan["id"]))

    return {"messages": [AIMessage(content=confirm_msg)]}


async def refine_node(state: PlannerState) -> Dict[str, Any]:
    """Generate an updated plan based on user feedback, save and broadcast."""
    plan_id = state["plan_id"]
    project_id = state["project_id"]

    settings = await data_client.get_settings()
    planner_agent = state.get("planner_agent")

    llm = _build_llm(settings, planner_agent)
    system_content = _build_review_system(state, planner_agent)
    messages = [SystemMessage(content=system_content)] + list(state["messages"])

    response = await llm.ainvoke(messages)
    text = (
        response.content
        if isinstance(response.content, str)
        else json.dumps(response.content)
    )

    parsed = _parse_planner_response(text)

    if not parsed or not parsed.get("plan"):
        err = (
            "Sorry, I couldn't parse the updated plan. "
            "Please try describing your changes again."
        )
        sse_manager.broadcast(plan_id, {"type": "chat_token", "content": err})
        sse_manager.broadcast(plan_id, {"type": "chat_end"})
        asyncio.create_task(
            data_client.save_message(
                {
                    "project_id": project_id,
                    "plan_id": plan_id,
                    "role": "assistant",
                    "content": err,
                }
            )
        )
        return {"messages": [AIMessage(content=err)]}

    planned_tasks = [PlannedTask(t) for t in parsed["plan"].get("tasks", [])]
    saved_tasks = await _save_draft_tasks(plan_id, planned_tasks)
    msg_text = parsed["message"]

    asyncio.create_task(
        data_client.save_message(
            {
                "project_id": project_id,
                "plan_id": plan_id,
                "role": "assistant",
                "content": msg_text,
            }
        )
    )
    await _stream_message_chunks(plan_id, msg_text)

    sse_manager.broadcast(
        plan_id,
        {
            "type": "plan_draft",
            "plan": _build_plan_payload(plan_id, state, saved_tasks),
        },
    )
    sse_manager.broadcast(plan_id, {"type": "chat_end"})

    return {
        "messages": [AIMessage(content=msg_text)],
        "plan_draft": {"tasks": saved_tasks},
    }


# ─── Routing ──────────────────────────────────────────────────────────────────


def route_after_planner(state: PlannerState) -> str:
    last = state["messages"][-1]

    if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
        return "tools_node"

    text = last.content if isinstance(last.content, str) else ""
    parsed = _parse_planner_response(text)
    if parsed and parsed.get("ready_for_plan") and parsed.get("plan"):
        return "save_draft_node"

    return "interview_wait_node"


def route_after_review(state: PlannerState) -> str:
    last = state["messages"][-1]
    if isinstance(last, HumanMessage):
        lower = last.content.lower().strip()
        if (
            lower in ("confirm", "yes")
            or lower.startswith("confirm")
            or "looks good" in lower
            or "start execution" in lower
            or "approve" in lower
        ):
            return "confirm_node"
    return "refine_node"


# ─── Graph construction ───────────────────────────────────────────────────────


def _build_graph() -> Any:
    checkpointer = _get_checkpointer()
    builder = StateGraph(PlannerState)

    builder.add_node("prepare_node", prepare_node)
    builder.add_node("interview_wait_node", interview_wait_node)
    builder.add_node("planner_node", planner_node)
    builder.add_node("tools_node", tools_node)
    builder.add_node("save_draft_node", save_draft_node)
    builder.add_node("review_wait_node", review_wait_node)
    builder.add_node("confirm_node", confirm_node)
    builder.add_node("refine_node", refine_node)

    builder.add_edge(START, "prepare_node")
    builder.add_edge("prepare_node", "interview_wait_node")
    builder.add_edge("interview_wait_node", "planner_node")
    builder.add_conditional_edges(
        "planner_node",
        route_after_planner,
        {
            "tools_node": "tools_node",
            "save_draft_node": "save_draft_node",
            "interview_wait_node": "interview_wait_node",
        },
    )
    builder.add_edge("tools_node", "planner_node")
    builder.add_edge("save_draft_node", "review_wait_node")
    builder.add_conditional_edges(
        "review_wait_node",
        route_after_review,
        {
            "confirm_node": "confirm_node",
            "refine_node": "refine_node",
        },
    )
    builder.add_edge("confirm_node", END)
    builder.add_edge("refine_node", "review_wait_node")

    return builder.compile(checkpointer=checkpointer)


# ─── Public API ───────────────────────────────────────────────────────────────


async def init_session(plan_id: str) -> None:
    """
    Initialize a planning session for the given plan_id.

    If a LangGraph checkpoint already exists (browser reconnect), returns
    immediately — the graph is already paused at an interrupt.

    Otherwise, starts the graph in the background so the SSE event_stream
    queue is created before the greeting is broadcast.
    """
    checkpointer = _get_checkpointer()
    if checkpointer is None:
        logger.warning(
            "init_session: checkpointer not ready for plan %s — skipping", plan_id
        )
        return

    graph = _graph
    if graph is None:
        logger.error("init_session: graph not built for plan %s", plan_id)
        return

    thread_config = {"configurable": {"thread_id": plan_id}}

    try:
        checkpoint = await checkpointer.aget(thread_config)
        if checkpoint is not None:
            logger.debug(
                "init_session: checkpoint found for %s — reconnecting", plan_id
            )
            return
    except Exception as exc:
        logger.warning(
            "init_session: could not check checkpoint for %s: %s", plan_id, exc
        )

    initial_state: PlannerState = {
        "messages": [],
        "plan_id": plan_id,
        "project_id": "",
        "plan_title": None,
        "project_context": None,
        "repos": [],
        "planner_agent": None,
        "phase": "interview",
        "plan_draft": None,
    }

    async def _run() -> None:
        try:
            await graph.ainvoke(initial_state, thread_config)
        except Exception as exc:
            logger.exception("init_session: graph error for plan %s: %s", plan_id, exc)

    asyncio.create_task(_run())


async def handle_user_message(plan_id: str, content: str) -> None:
    """
    Resume the planning graph with the user's message.

    Called as an asyncio background task from the chat API.
    """
    graph = _graph
    if graph is None:
        logger.error("handle_user_message: graph not built for plan %s", plan_id)
        return

    thread_config = {"configurable": {"thread_id": plan_id}}

    try:
        await graph.ainvoke(Command(resume=content), thread_config)
    except Exception as exc:
        logger.exception(
            "handle_user_message: graph error for plan %s: %s", plan_id, exc
        )
