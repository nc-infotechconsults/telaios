from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import StructuredTool

from agent_service.agents.coordinator.drivers.base import (
    AgentArtifact,
    AgentResult,
    AgentStatus,
    AgentTask,
)
from agent_service.core.schema_utils import build_pydantic_model_from_schema
from agent_service.core.types import Skill

from .graph import build_graph
from .tools import build_builtin_tools


class LangGraphDriver:
    """LangGraph-based coding agent driver (create_react_agent)."""

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
        self._sub_agent_tools: List[StructuredTool] = []
        self._status: AgentStatus = "idle"

    def set_sub_agent_tools(self, tools: List[StructuredTool]) -> None:
        """Inject compiled sub-agent StructuredTools."""
        self._sub_agent_tools = tools

    async def get_status(self) -> AgentStatus:
        return self._status

    async def execute(self, task: AgentTask, workspaces: dict[str, str]) -> AgentResult:
        self._status = "busy"

        # Build skill tools: each skill becomes a StructuredTool whose coroutine
        # returns the skill instructions when called.
        skill_tools: List[StructuredTool] = []
        for s in self._skills:
            schema_dict = s.inputSchema.model_dump()
            args_schema = build_pydantic_model_from_schema(schema_dict, f"Skill_{s.name}")
            instructions_text = s.instructions

            async def _skill_fn(_instructions=instructions_text, **kwargs: Any) -> str:
                return _instructions

            skill_tools.append(
                StructuredTool.from_function(
                    coroutine=_skill_fn,
                    name=s.name,
                    description=f"{s.description}\n\nInstructions:\n{s.instructions}",
                    args_schema=args_schema,
                )
            )

        all_tools = (
            build_builtin_tools(workspaces)
            + skill_tools
            + self._sub_agent_tools
        )

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

        if self._system_prompt and self._system_prompt_mode == "override":
            system_prompt = f"{workspace_block}{task_block}" + self._system_prompt
        elif self._system_prompt and self._system_prompt_mode in ("extend", "append"):
            system_prompt = builtin_prompt + "\n\n" + self._system_prompt
        else:
            system_prompt = builtin_prompt

        try:
            graph = build_graph(self._llm, all_tools, system_prompt)
            final_state = await graph.ainvoke(
                {"messages": [HumanMessage(content="Begin.")]},
                {"recursion_limit": 100},
            )

            self._status = "idle"
            messages: list = final_state.get("messages", [])

            # Extract result: prefer the finish ToolMessage, fall back to last AIMessage.
            finish_tm = next(
                (
                    m for m in reversed(messages)
                    if isinstance(m, ToolMessage) and getattr(m, "name", None) == "finish"
                ),
                None,
            )
            if finish_tm:
                result_text = (
                    finish_tm.content
                    if isinstance(finish_tm.content, str)
                    else json.dumps(finish_tm.content)
                )
            else:
                last_ai = next(
                    (m for m in reversed(messages) if isinstance(m, AIMessage)), None
                )
                result_text = (
                    (last_ai.content if isinstance(last_ai.content, str) else json.dumps(last_ai.content))
                    if last_ai
                    else ""
                )

            # Build tool call log artifact.
            log_lines: list[str] = []
            tool_call_count = 0
            for msg in messages:
                if isinstance(msg, AIMessage):
                    tool_calls = getattr(msg, "tool_calls", []) or []
                    for tc in tool_calls:
                        tool_call_count += 1
                        args_fmt = json.dumps(tc.get("args", {}), indent=2).replace("\n", "\n    ")
                        log_lines.append(f"[{tool_call_count}] CALL  {tc['name']}")
                        log_lines.append(f"    args: {args_fmt}")
                elif isinstance(msg, ToolMessage):
                    content_str = (
                        msg.content
                        if isinstance(msg.content, str)
                        else json.dumps(msg.content)
                    )
                    preview = content_str[:500] + ("…" if len(content_str) > 500 else "")
                    log_lines.append(f"    → {getattr(msg, 'name', None) or 'result'}: {preview}")
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
                success=True,
                output=await self._format_structured_output(result_text),
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
