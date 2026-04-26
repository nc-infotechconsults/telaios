from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from langchain_core.language_models.chat_models import BaseChatModel

from agent_service.agents.coordinator.drivers.base import (
    AgentArtifact,
    AgentResult,
    AgentStatus,
    AgentTask,
)
from agent_service.core.schema_utils import build_pydantic_model_from_schema
from agent_service.core.types import Skill

from .state import _CodingState
from .tools import CustomToolHandler, _BUILTIN_TOOLS
from .graph import build_graph


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
        system_prompt_mode: str = "extend",
        structured_output: Optional[Dict] = None,
        sub_agents: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        self._llm = llm
        self._skills = skills
        self._system_prompt = system_prompt
        self._system_prompt_mode = system_prompt_mode
        self._structured_output = structured_output
        self._sub_agents: List[Dict[str, Any]] = sub_agents or []
        self._sub_agent_tool_defs: List[Dict[str, Any]] = []
        self._sub_agent_handlers: Dict[str, CustomToolHandler] = {}
        self._status: AgentStatus = "idle"

    def set_sub_agent_tools(
        self,
        tool_defs: List[Dict[str, Any]],
        handlers: Dict[str, CustomToolHandler],
    ) -> None:
        """Inject compiled sub-agent tool definitions and dispatch handlers."""
        self._sub_agent_tool_defs = tool_defs
        self._sub_agent_handlers = handlers

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
        all_tools = _BUILTIN_TOOLS + skill_tools + self._sub_agent_tool_defs
        all_handlers: Dict[str, CustomToolHandler] = {**self._sub_agent_handlers}

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
            system_prompt = f"{workspace_block}{task_block}" + self._system_prompt
        elif self._system_prompt and self._system_prompt_mode in ("extend", "append"):
            system_prompt = builtin_prompt + "\n\n" + self._system_prompt
        else:
            system_prompt = builtin_prompt

        try:
            graph = build_graph(bound_llm, all_tools, all_handlers or None)
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
                output=await self._format_structured_output(state.get("result", "")),
                error=state.get("error"),
                artifacts=artifacts,
            )
        except Exception as exc:
            self._status = "error"
            return AgentResult(success=False, output="", error=str(exc))

    async def _format_structured_output(self, raw_output: str) -> str:
        """If a structured_output schema is configured, parse the output through it."""
        if not self._structured_output or not raw_output:
            return raw_output

        try:
            parsed = json.loads(raw_output)
            if isinstance(parsed, dict):
                return json.dumps(parsed)
        except (json.JSONDecodeError, TypeError):
            pass

        try:
            model = build_pydantic_model_from_schema(self._structured_output, "AgentOutput")
            structured_llm = self._llm.with_structured_output(model)
            result = await structured_llm.ainvoke(
                f"Extract structured data from the following text. "
                f"Return ONLY a JSON object matching the schema.\n\n{raw_output}"
            )
            if hasattr(result, "model_dump"):
                return json.dumps(result.model_dump())
            return json.dumps(result) if result else raw_output
        except Exception:
            return raw_output
