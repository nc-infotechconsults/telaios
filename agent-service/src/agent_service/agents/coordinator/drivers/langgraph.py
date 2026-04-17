from __future__ import annotations

import asyncio
import json
import os
import shlex
import subprocess
from typing import Any, Dict, List, Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph
from typing_extensions import Annotated, TypedDict

from agent_service.agents.coordinator.drivers.base import (
    AgentArtifact,
    AgentResult,
    AgentStatus,
    AgentTask,
)
from agent_service.core.types import Skill


class _CodingState(TypedDict):
    messages: Annotated[list, lambda a, b: a + b]
    workspaces: dict[str, str]
    result: str
    done: bool
    error: Optional[str]


_BUILTIN_TOOLS = [
    {
        "name": "run_shell",
        "description": "Execute a shell command in a workspace directory.",
        "schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The shell command to run."},
                "cwd": {"type": "string", "description": "Working directory (absolute path or workspace name)."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "write_file",
        "description": "Write (or overwrite) a file at the given path.",
        "schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to the workspace root."},
                "content": {"type": "string", "description": "Full file content to write."},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file.",
        "schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to the workspace root."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "finish",
        "description": "Signal that the task is complete and provide a summary.",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "A concise summary of what was accomplished."},
            },
            "required": ["summary"],
        },
    },
]


async def _dispatch_tool(
    tool_name: str, args: dict, workspaces: dict[str, str]
) -> dict:
    primary_workspace = next(iter(workspaces.values()), "/tmp")

    def _resolve_cwd(cwd_arg: Any) -> str:
        if isinstance(cwd_arg, str):
            return workspaces.get(cwd_arg) or (cwd_arg if os.path.isabs(cwd_arg) else os.path.join(primary_workspace, cwd_arg))
        return primary_workspace

    try:
        if tool_name == "run_shell":
            cwd = _resolve_cwd(args.get("cwd"))
            proc = await asyncio.create_subprocess_shell(
                args["command"],
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
            except asyncio.TimeoutError:
                proc.kill()
                return {"text": "Command timed out after 30 seconds.", "is_error": True}
            text = f"stdout:\n{stdout.decode(errors='replace')}"
            if stderr:
                text += f"\nstderr:\n{stderr.decode(errors='replace')}"
            return {"text": text, "is_error": False}

        if tool_name == "write_file":
            file_path = os.path.join(primary_workspace, args["path"])
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as fh:
                fh.write(args["content"])
            return {"text": f"File written: {args['path']}", "is_error": False}

        if tool_name == "read_file":
            file_path = os.path.join(primary_workspace, args["path"])
            with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
                return {"text": fh.read(), "is_error": False}

        if tool_name == "finish":
            return {"text": str(args.get("summary", "")), "is_error": False}

        return {"text": f"Unknown tool: {tool_name}", "is_error": True}
    except Exception as exc:
        return {"text": f"Tool error ({tool_name}): {exc}", "is_error": True}


class LangGraphDriver:
    """LangGraph-based coding agent driver."""

    # Built-in coding system prompt used when no profile override is configured.
    _BUILTIN_SYSTEM = (
        "You are an expert software engineer. Complete the coding task below using the provided tools.\n\n"
        "{workspace_block}"
        "{task_block}"
        "IMPORTANT RULES:\n"
        "1. Use tools to implement the task (read files, run commands, write code).\n"
        "2. Once you have written the necessary code changes, call the `finish` tool IMMEDIATELY with a summary.\n"
        "3. Do NOT loop trying to verify or re-test your work. Write the code, then call `finish`.\n"
        "4. If a tool returns an error, try once to fix it, then call `finish` with what you accomplished.\n"
        "5. Aim to complete the task in at most 10 tool calls."
    )

    def __init__(
        self,
        llm: BaseChatModel,
        skills: List[Skill],
        system_prompt: Optional[str] = None,
        system_prompt_mode: str = "override",
    ) -> None:
        self._llm = llm
        self._skills = skills
        self._system_prompt = system_prompt
        self._system_prompt_mode = system_prompt_mode
        self._status: AgentStatus = "idle"

    async def get_status(self) -> AgentStatus:
        return self._status

    async def execute(self, task: AgentTask, workspaces: dict[str, str]) -> AgentResult:
        self._status = "busy"

        skill_tools = [
            {
                "name": s.name,
                "description": f"{s.description}\n\nInstructions:\n{s.instructions}",
                "schema": s.inputSchema.model_dump(),
            }
            for s in self._skills
        ]
        all_tools = _BUILTIN_TOOLS + skill_tools

        bound_llm = self._llm.bind_tools(all_tools) if hasattr(self._llm, "bind_tools") else self._llm

        workspace_block = (
            "Workspaces (name → path):\n"
            + (
                "\n".join(f"  {n}: {p}" for n, p in workspaces.items())
                if workspaces
                else "  (no workspace cloned — write files to the current directory)"
            )
            + "\n\n"
        )
        task_block = f"Task: {task.title}\n{task.description}\n\n"
        builtin_prompt = self._BUILTIN_SYSTEM.format(
            workspace_block=workspace_block,
            task_block=task_block,
        )

        # Compose the effective system prompt using the profile's setting.
        if self._system_prompt and self._system_prompt_mode == "override":
            # Full replacement — still inject workspace/task context up front.
            system_prompt = (
                f"{workspace_block}{task_block}"
                + self._system_prompt
            )
        elif self._system_prompt and self._system_prompt_mode == "extend":
            system_prompt = builtin_prompt + "\n\n" + self._system_prompt
        else:
            system_prompt = builtin_prompt

        try:
            graph = self._build_graph(bound_llm, all_tools)
            initial_state: _CodingState = {
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Begin."},
                ],
                "workspaces": workspaces,
                "result": "",
                "done": False,
                "error": None,
            }
            final_state = await graph.ainvoke(initial_state, {"recursion_limit": 100})

            self._status = "idle"
            state: _CodingState = final_state

            # Build tool-call log artifact
            log_lines: list[str] = []
            tool_call_count = 0
            for msg in state["messages"]:
                if msg.get("role") == "assistant":
                    try:
                        calls = json.loads(msg["content"])
                        if isinstance(calls, list) and calls and "name" in calls[0]:
                            for call in calls:
                                tool_call_count += 1
                                args_fmt = json.dumps(call.get("args", {}), indent=2).replace("\n", "\n    ")
                                log_lines.append(f"[{tool_call_count}] CALL  {call['name']}")
                                log_lines.append(f"    args: {args_fmt}")
                    except Exception:
                        pass
                elif msg.get("role") == "tool":
                    preview = msg["content"][:500] + ("…" if len(msg["content"]) > 500 else "")
                    log_lines.append(f"    → {msg.get('name','result')}: {preview}")
                    log_lines.append("")

            artifacts: list[AgentArtifact] = []
            if log_lines:
                artifacts.append(
                    AgentArtifact(
                        type="log",
                        title=f"Tool Call Log ({tool_call_count} call{'s' if tool_call_count != 1 else ''})",
                        content="\n".join(log_lines),
                        content_type="text/plain",
                        metadata={"tool_call_count": tool_call_count},
                    )
                )

            return AgentResult(
                success=not state.get("error"),
                output=state.get("result", ""),
                error=state.get("error"),
                artifacts=artifacts,
            )
        except Exception as exc:
            self._status = "error"
            return AgentResult(success=False, output="", error=str(exc))

    def _build_graph(self, bound_llm: Any, tools: list) -> CompiledStateGraph:
        from langchain_core.messages import AIMessage as _AI, ToolMessage as _TM

        async def think(state: _CodingState) -> dict:
            lc_msgs = []
            for m in state["messages"]:
                role = m.get("role")
                content = m.get("content", "")
                if role == "system":
                    lc_msgs.append(SystemMessage(content=content))
                elif role == "user":
                    lc_msgs.append(HumanMessage(content=content))
                elif role == "assistant":
                    # Attempt to reconstruct tool_calls
                    try:
                        parsed = json.loads(content)
                        if isinstance(parsed, list) and parsed and "name" in parsed[0]:
                            lc_msgs.append(
                                _AI(
                                    content="",
                                    tool_calls=[
                                        {"name": tc["name"], "args": tc.get("args", {}), "id": tc["id"], "type": "tool_call"}
                                        for tc in parsed
                                    ],
                                )
                            )
                            continue
                    except Exception:
                        pass
                    lc_msgs.append(_AI(content=content))
                elif role == "tool":
                    lc_msgs.append(_TM(content=content, tool_call_id=m.get("tool_call_id", "")))

            response = await bound_llm.ainvoke(lc_msgs)
            ai_msg: _AI = response
            tool_calls = getattr(ai_msg, "tool_calls", []) or []

            if not tool_calls:
                text = ai_msg.content if isinstance(ai_msg.content, str) else json.dumps(ai_msg.content)
                return {"messages": [{"role": "assistant", "content": text}], "result": text, "done": True}

            return {"messages": [{"role": "assistant", "content": json.dumps(tool_calls)}]}

        async def act(state: _CodingState) -> dict:
            last_msg = state["messages"][-1]
            try:
                tool_calls = json.loads(last_msg["content"])
            except Exception:
                return {"done": True, "error": "Failed to parse tool calls from assistant message."}

            tool_messages: list[dict] = []
            for call in tool_calls:
                result = await _dispatch_tool(call["name"], call.get("args", {}), state["workspaces"])
                text = result["text"]
                is_error = result["is_error"]

                if call["name"] == "finish" and not is_error:
                    tool_messages.append({"role": "tool", "content": text, "tool_call_id": call["id"], "name": call["name"]})
                    return {"messages": tool_messages, "result": text, "done": True}

                tool_messages.append({
                    "role": "tool",
                    "content": f"[ERROR] {text}" if is_error else text,
                    "tool_call_id": call["id"],
                    "name": call["name"],
                })

            return {"messages": tool_messages}

        workflow = StateGraph(_CodingState)
        workflow.add_node("think", think)
        workflow.add_node("act", act)
        workflow.set_entry_point("think")
        workflow.add_conditional_edges("think", lambda s: END if s.get("done") else "act")
        workflow.add_edge("act", "think")
        return workflow.compile()
