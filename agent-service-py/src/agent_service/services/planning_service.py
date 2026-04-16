from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, List, Literal, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool

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

# ─── Types ────────────────────────────────────────────────────────────────────

Phase = Literal["interview", "review"]


class PlannedTask:
    def __init__(self, data: Dict[str, Any]) -> None:
        self.title: str = data["title"]
        self.description: str = data.get("description", "")
        self.type: str = data.get("type", "general")
        self.execution_order: int = data.get("execution_order", 0)
        self.depends_on_task_indices: List[int] = data.get("depends_on_task_indices", [])
        self.recommended_agent_profile_id: Optional[str] = data.get(
            "recommended_agent_profile_id"
        )
        self.repository_ids: List[str] = data.get("repository_ids", [])


class Session:
    def __init__(
        self,
        plan_id: str,
        project_id: str,
        plan_title: Optional[str],
        phase: Phase,
        messages: List[Dict[str, str]],
        plan_draft: Optional[Dict[str, Any]],
        agent_profiles: List[Dict[str, Any]],
        project_repositories: List[Dict[str, Any]],
        project_context: Optional[Dict[str, Any]],
        repo_tools: List[StructuredTool],
    ) -> None:
        self.plan_id = plan_id
        self.project_id = project_id
        self.plan_title = plan_title
        self.phase = phase
        self.messages = messages
        self.plan_draft = plan_draft
        self.agent_profiles = agent_profiles
        self.project_repositories = project_repositories
        self.project_context = project_context
        self.repo_tools = repo_tools


# In-memory session store keyed by plan_id
_sessions: Dict[str, Session] = {}


# ─── Streaming helpers ────────────────────────────────────────────────────────

async def _stream_message_chunks(plan_id: str, text: str) -> None:
    chunks = re.findall(r"\S+\s*", text) or [text]
    for chunk in chunks:
        sse_manager.broadcast(plan_id, {"type": "chat_token", "content": chunk})
        await asyncio.sleep(0.018)


def _saved_task_to_planned(task: Dict[str, Any], all_tasks: List[Dict[str, Any]]) -> PlannedTask:
    id_to_index = {t["id"]: i for i, t in enumerate(all_tasks)}
    return PlannedTask(
        {
            "title": task["title"],
            "description": task["description"],
            "type": task["type"],
            "execution_order": task["execution_order"],
            "depends_on_task_indices": [
                id_to_index[dep_id]
                for dep_id in task.get("depends_on_task_ids", [])
                if dep_id in id_to_index
            ],
            "recommended_agent_profile_id": task.get("agent_profile_id"),
            "repository_ids": task.get("repository_ids", []),
        }
    )


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

    # Pass 1: create tasks (no deps yet)
    saved = await asyncio.gather(
        *[
            data_client.create_task(
                {
                    "plan_id": plan_id,
                    "title": t.title,
                    "description": t.description or "",
                    "type": t.type or "general",
                    "status": "pending",
                    "execution_order": t.execution_order if t.execution_order is not None else i,
                    **(
                        {"agent_profile_id": t.recommended_agent_profile_id}
                        if t.recommended_agent_profile_id
                        else {}
                    ),
                    "repository_ids": t.repository_ids or [],
                }
            )
            for i, t in enumerate(planned_tasks)
        ]
    )

    # Pass 2: patch dependency links
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


def _build_plan_draft_payload(
    plan_id: str, session: Session, saved_tasks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    from datetime import datetime, timezone

    return {
        "id": plan_id,
        "project_id": session.project_id,
        "title": session.plan_title,
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

def _build_repo_tools(repos: List[Dict[str, Any]], project_id: str) -> List[StructuredTool]:
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

    from pydantic import BaseModel

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


# ─── Tool-use loop ────────────────────────────────────────────────────────────

async def _run_tool_loop(
    llm: Any,
    tools: List[StructuredTool],
    messages: List[Dict[str, str]],
    plan_id: str,
) -> str:
    tool_map = {t.name: t for t in tools}

    lc_messages = []
    for m in messages:
        if m["role"] == "system":
            lc_messages.append(SystemMessage(content=m["content"]))
        elif m["role"] == "user":
            lc_messages.append(HumanMessage(content=m["content"]))
        else:
            lc_messages.append(AIMessage(content=m["content"]))

    llm_with_tools = llm.bind_tools(tools) if tools else llm
    MAX_ROUNDS = 12

    for _ in range(MAX_ROUNDS):
        response = await llm_with_tools.ainvoke(lc_messages)
        ai_msg = response
        tool_calls = getattr(ai_msg, "tool_calls", []) or []

        if not tool_calls:
            content = ai_msg.content
            return content if isinstance(content, str) else json.dumps(content)

        lc_messages.append(ai_msg)

        tool_results: List[ToolMessage] = []
        for tc in tool_calls:
            tool = tool_map.get(tc["name"])
            sse_manager.broadcast(plan_id, {
                "type": "chat_tool_use",
                "tool": tc["name"],
                "input": tc.get("args", {}),
            })
            try:
                result = str(await tool.ainvoke(tc["args"])) if tool else f"Unknown tool: {tc['name']}"
            except Exception as exc:
                result = f"Tool error: {exc}"
            tool_results.append(ToolMessage(content=result, tool_call_id=tc["id"]))

        lc_messages.extend(tool_results)

    final = await llm.ainvoke(lc_messages)
    content = final.content
    return content if isinstance(content, str) else json.dumps(content)


# ─── Project context ──────────────────────────────────────────────────────────

def _scan_repo_structure(root_path: str, max_depth: int = 3) -> str:
    IGNORE = frozenset(
        [
            ".git", "node_modules", "__pycache__", ".next", "dist", "build",
            ".venv", "venv", ".mypy_cache", ".pytest_cache", "coverage",
            ".turbo", ".cache", "vendor",
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
        filtered = [e for e in entries if e.name not in IGNORE and not e.name.startswith(".")]
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
    project, all_plans, repos = await asyncio.gather(
        data_client.get_project(project_id),
        data_client.get_project_plans(project_id),
        data_client.get_project_repositories(project_id),
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

    return {
        "name": project["name"],
        "description": project.get("description"),
        "existingPlans": existing_plans,
        "repoStructures": repo_structures,
    }


def _build_project_context_text(ctx: Dict[str, Any], plan_title: Optional[str]) -> str:
    lines: list[str] = []
    lines.append(f"Project: {ctx['name']}")
    if ctx.get("description"):
        lines.append(f"Description: {ctx['description']}")

    if ctx.get("existingPlans"):
        lines.append("\nExisting plans for this project (do NOT duplicate their scope):")
        for p in ctx["existingPlans"]:
            lines.append(f"  - \"{p['title'] or '(untitled)'}\" [{p['status']}]")

    if plan_title:
        lines.append(f'\nThis plan is titled: "{plan_title}"')

    if ctx.get("repoStructures"):
        lines.append("\nRepository file structure(s):")
        for r in ctx["repoStructures"]:
            lines.append(f"\n### {r['name']}\n```\n{r['structure']}\n```")

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
    '"recommended_agent_profile_id":"uuid_or_null","repository_ids":["repo_uuid"]}'
)

STRUCTURED_OUTPUT_INSTRUCTIONS = (
    "\n\nCRITICAL: Always respond with ONLY valid JSON — no markdown, no extra text:\n"
    '{"message":"<natural language reply>","ready_for_plan":false,"plan":null}\n\n'
    "When you have gathered enough information to build a complete plan, set ready_for_plan to true "
    "and include the full plan in the same response:\n"
    f'{{"message":"<brief plan summary for the user>","ready_for_plan":true,"plan":{{"tasks":[{TASK_SCHEMA}]}}}}\n\n'
    "Plan rules:\n"
    "- depends_on_task_indices are 0-based indices into the tasks array\n"
    "- Assign the best-matching agent profile id for each task (or null)\n"
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


def _build_message_list(
    history: List[Dict[str, str]], system_content: str
) -> List[Dict[str, str]]:
    base: List[Dict[str, str]] = [{"role": "system", "content": system_content}]
    if not history:
        return base
    # Ensure we don't start with an assistant message (some providers require user-first)
    messages = list(history)
    if messages and messages[0]["role"] == "assistant":
        messages = [{"role": "user", "content": "(session resumed)"}] + messages
    return base + messages


# ─── Session init ─────────────────────────────────────────────────────────────

async def init_session(plan_id: str) -> None:
    if plan_id in _sessions:
        return

    plan = await data_client.get_plan(plan_id)
    profiles, repos, existing_messages, existing_tasks, project_context = await asyncio.gather(
        data_client.get_agent_profiles(),
        data_client.get_project_repositories(plan["project_id"]),
        data_client.get_plan_messages(plan_id),
        data_client.get_plan_tasks(plan_id),
        _gather_project_context(plan["project_id"], plan_id),
    )

    is_first_visit = len(existing_messages) == 0
    is_in_review = plan["status"] == "draft" and len(existing_tasks) > 0

    history = [
        {"role": m["role"], "content": m["content"]}
        for m in existing_messages
        if m["role"] in ("user", "assistant")
    ]

    greeting = _build_greeting(plan.get("title"))
    session = Session(
        plan_id=plan_id,
        project_id=plan["project_id"],
        plan_title=plan.get("title"),
        phase="review" if is_in_review else "interview",
        messages=history if history else [{"role": "assistant", "content": greeting}],
        plan_draft=(
            {"tasks": [_saved_task_to_planned(t, existing_tasks) for t in existing_tasks]}
            if is_in_review
            else None
        ),
        agent_profiles=profiles,
        project_repositories=repos,
        project_context=project_context,
        repo_tools=_build_repo_tools(repos, plan["project_id"]),
    )
    _sessions[plan_id] = session

    if is_first_visit:
        await asyncio.sleep(0.15)
        sse_manager.broadcast(plan_id, {"type": "chat_token", "content": greeting})
        asyncio.create_task(
            data_client.save_message(
                {
                    "project_id": plan["project_id"],
                    "plan_id": plan_id,
                    "role": "assistant",
                    "content": greeting,
                }
            )
        )
        sse_manager.broadcast(plan_id, {"type": "chat_end"})


# ─── User message handler ─────────────────────────────────────────────────────

async def handle_user_message(plan_id: str, content: str) -> None:
    session = _sessions.get(plan_id)

    if not session:
        plan = await data_client.get_plan(plan_id)
        profiles, repos, existing_messages, existing_tasks, project_context = await asyncio.gather(
            data_client.get_agent_profiles(),
            data_client.get_project_repositories(plan["project_id"]),
            data_client.get_plan_messages(plan_id),
            data_client.get_plan_tasks(plan_id),
            _gather_project_context(plan["project_id"], plan_id),
        )

        is_in_review = plan["status"] == "draft" and len(existing_tasks) > 0
        history = [
            {"role": m["role"], "content": m["content"]}
            for m in existing_messages
            if m["role"] in ("user", "assistant")
        ]
        greeting = _build_greeting(plan.get("title"))
        session = Session(
            plan_id=plan_id,
            project_id=plan["project_id"],
            plan_title=plan.get("title"),
            phase="review" if is_in_review else "interview",
            messages=history if history else [{"role": "assistant", "content": greeting}],
            plan_draft=(
                {"tasks": [_saved_task_to_planned(t, existing_tasks) for t in existing_tasks]}
                if is_in_review
                else None
            ),
            agent_profiles=profiles,
            project_repositories=repos,
            project_context=project_context,
            repo_tools=_build_repo_tools(repos, plan["project_id"]),
        )
        _sessions[plan_id] = session

    trimmed = content.strip()
    session.messages.append({"role": "user", "content": trimmed})
    await data_client.save_message(
        {
            "project_id": session.project_id,
            "plan_id": plan_id,
            "role": "user",
            "content": trimmed,
        }
    )

    sse_manager.broadcast(plan_id, {"type": "chat_thinking"})

    settings = await data_client.get_settings()
    llm = build_chat_model(
        provider=settings["llm_provider"],
        model=settings["llm_model"],
        api_key=settings.get("llm_api_key_raw") or "",
        base_url=settings.get("llm_base_url"),
    )

    if session.phase == "interview":
        await _run_interview(session, llm, plan_id)
    else:
        await _run_review(session, llm, trimmed, plan_id)


# ─── Interview phase ──────────────────────────────────────────────────────────

async def _run_interview(session: Session, llm: Any, plan_id: str) -> None:
    profiles_text = (
        "\n".join(
            f"- id:{p['id']} name:{p['name']} type:{p.get('agent_type','')} skills:[{','.join(s['name'] for s in p.get('skills',[]))}]"
            for p in session.agent_profiles
        )
        or "None configured yet."
    )

    repos_text = (
        "\n".join(
            f"- id:{r['id']} name:{r['name']} url:{r.get('remote_url','(local)')}"
            for r in session.project_repositories
        )
        or "None configured yet."
    )

    context_block = ""
    if session.project_context:
        context_block = "\n\n## Project Context\n" + _build_project_context_text(
            session.project_context, session.plan_title
        )

    has_tools = bool(session.repo_tools)
    tools_note = (
        "\n\nYou have tools to explore the repository filesystem (list_directory, read_file, search_code). "
        "Use them proactively to understand the codebase structure, dependencies, and conventions BEFORE asking the user questions. "
        "Only ask the user what you cannot discover from the code."
        if has_tools
        else ""
    )

    system_content = (
        BASE_SYSTEM
        + context_block
        + f"\n\nAvailable agent profiles:\n{profiles_text}"
        + f"\n\nProject repositories (use these IDs in task repository_ids):\n{repos_text}"
        + tools_note
        + "\n\nUse the project context above to ask targeted follow-up questions and avoid duplicating existing work. "
        "Ask ONE focused follow-up question at a time. "
        "Set ready_for_plan to true only when you have enough information for a complete plan."
        + STRUCTURED_OUTPUT_INSTRUCTIONS
    )

    lc_messages = _build_message_list(session.messages, system_content)
    text = await _run_tool_loop(llm, session.repo_tools, lc_messages, plan_id)

    parsed = _parse_planner_response(text)

    if not parsed:
        session.messages.append({"role": "assistant", "content": text})
        await _stream_message_chunks(plan_id, text)
        await data_client.save_message(
            {"project_id": session.project_id, "plan_id": plan_id, "role": "assistant", "content": text}
        )
        sse_manager.broadcast(plan_id, {"type": "chat_end"})
        return

    session.messages.append({"role": "assistant", "content": parsed["message"]})
    await _stream_message_chunks(plan_id, parsed["message"])
    await data_client.save_message(
        {
            "project_id": session.project_id,
            "plan_id": plan_id,
            "role": "assistant",
            "content": parsed["message"],
        }
    )

    if parsed["ready_for_plan"] and parsed.get("plan"):
        task_dicts = parsed["plan"].get("tasks", [])
        planned = [PlannedTask(t) for t in task_dicts]
        saved_tasks = await _save_draft_tasks(plan_id, planned)
        session.plan_draft = {"tasks": [_saved_task_to_planned(t, saved_tasks) for t in saved_tasks]}
        session.phase = "review"
        sse_manager.broadcast(
            plan_id,
            {"type": "plan_draft", "plan": _build_plan_draft_payload(plan_id, session, saved_tasks)},
        )

    sse_manager.broadcast(plan_id, {"type": "chat_end"})


# ─── Review phase ─────────────────────────────────────────────────────────────

async def _run_review(session: Session, llm: Any, user_content: str, plan_id: str) -> None:
    lower = user_content.lower()
    is_confirm = (
        lower in ("confirm", "yes")
        or lower.startswith("confirm")
        or "looks good" in lower
        or "start execution" in lower
        or "approve" in lower
    )

    if is_confirm:
        await _confirm_plan(session, plan_id)
    else:
        await _refine_plan(session, llm, plan_id)


async def _confirm_plan(session: Session, plan_id: str) -> None:
    from datetime import datetime, timezone

    from agent_service.services.execution_service import start_execution

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
    session.messages.append({"role": "assistant", "content": confirm_msg})
    await _stream_message_chunks(plan_id, confirm_msg)
    await data_client.save_message(
        {
            "project_id": session.project_id,
            "plan_id": plan_id,
            "role": "assistant",
            "content": confirm_msg,
        }
    )
    sse_manager.broadcast(plan_id, {"type": "plan_confirmed", "plan_id": plan["id"]})

    _sessions.pop(plan_id, None)
    asyncio.create_task(start_execution(session.project_id, plan["id"]))


async def _refine_plan(session: Session, llm: Any, plan_id: str) -> None:
    profiles_text = (
        "\n".join(
            f"- id:{p['id']} name:{p['name']} type:{p.get('agent_type','')}"
            for p in session.agent_profiles
        )
        or "none"
    )
    repos_text = (
        "\n".join(
            f"- id:{r['id']} name:{r['name']}" for r in session.project_repositories
        )
        or "none"
    )

    context_block = ""
    if session.project_context:
        context_block = "\n\n## Project Context\n" + _build_project_context_text(
            session.project_context, session.plan_title
        )

    system_content = (
        BASE_SYSTEM
        + context_block
        + "\n\nThe user wants to revise the current plan."
        + f"\n\nCurrent plan:\n{json.dumps(session.plan_draft, indent=2, default=str)}"
        + f"\n\nAvailable agent profiles:\n{profiles_text}"
        + f"\n\nAvailable repositories (use these IDs in task repository_ids):\n{repos_text}"
        + "\n\nApply the user's requested changes and return the updated plan. Always set ready_for_plan to true."
        + STRUCTURED_OUTPUT_INSTRUCTIONS
    )

    lc_messages = _build_message_list(session.messages, system_content)
    response = await llm.ainvoke(
        [SystemMessage(content=m["content"]) if m["role"] == "system" else
         HumanMessage(content=m["content"]) if m["role"] == "user" else
         AIMessage(content=m["content"])
         for m in lc_messages]
    )
    text = response.content if isinstance(response.content, str) else json.dumps(response.content)

    parsed = _parse_planner_response(text)
    if not parsed or not parsed.get("plan"):
        err = "Sorry, I couldn't parse the updated plan. Please try describing your changes again."
        sse_manager.broadcast(plan_id, {"type": "chat_token", "content": err})
        sse_manager.broadcast(plan_id, {"type": "chat_end"})
        return

    task_dicts = parsed["plan"].get("tasks", [])
    planned = [PlannedTask(t) for t in task_dicts]
    saved_tasks = await _save_draft_tasks(plan_id, planned)
    session.plan_draft = {"tasks": [_saved_task_to_planned(t, saved_tasks) for t in saved_tasks]}
    session.messages.append({"role": "assistant", "content": parsed["message"]})
    await _stream_message_chunks(plan_id, parsed["message"])
    await data_client.save_message(
        {
            "project_id": session.project_id,
            "plan_id": plan_id,
            "role": "assistant",
            "content": parsed["message"],
        }
    )
    sse_manager.broadcast(
        plan_id,
        {"type": "plan_draft", "plan": _build_plan_draft_payload(plan_id, session, saved_tasks)},
    )
    sse_manager.broadcast(plan_id, {"type": "chat_end"})
