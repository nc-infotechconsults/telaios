"""
src/core/agent.py
-----------------
LangChain / LangGraph-backed agent implementation.

Uses ``langgraph.prebuilt.create_react_agent`` directly.  Tools are passed as
``ExecutableTool`` objects from ``telaios.tools``; the agent converts them to
LangChain ``StructuredTool`` instances internally.

Usage::

    from telaios.core.agent import LangChainAgent
    from telaios.core.factory import create_agent
    from telaios.core.types import AgentConfig, LLMConfig

    agent = create_agent(AgentConfig(
        llm=LLMConfig(provider="openai", model="gpt-4o", api_key="..."),
    ))
    result = await agent.run(AgentInput(messages=[...]))
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any

from telaios.core.llm import build_chat_model
from telaios.core.types import (
    AgentArtifact,
    AgentConfig,
    AgentInput,
    AgentOutput,
    GuardrailConfig,
    Message,
    MessageRole,
    StreamEvent,
    StreamEventType,
    ToolDefinition,
)

# ExecutableTool is imported lazily to avoid a hard dependency on src/tools
# at module-load time; src/tools may not be installed in all environments.
try:
    from telaios.tools.types import ExecutableTool as _ExecutableTool
except ImportError:  # pragma: no cover
    _ExecutableTool = None  # type: ignore[assignment, misc]

if TYPE_CHECKING:
    from langchain_core.language_models.chat_models import BaseChatModel
    from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)


class LangChainAgent:
    """
    LangChain / LangGraph-backed agent.

    Builds a ``create_react_agent`` graph lazily on first use.  Pass
    ``ExecutableTool`` objects from ``telaios.tools``; they are converted
    to ``StructuredTool`` instances internally.

    Sources:
    - create_react_agent: https://github.com/langchain-ai/langgraph/blob/main/libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py
    - astream_events v2: https://github.com/langchain-ai/langgraph/issues/3071
    """

    def __init__(self, config: AgentConfig) -> None:
        self._config = config
        self._graph: Any | None = None
        self._llm: BaseChatModel = build_chat_model(config.llm)
        self._tools: list[StructuredTool] = [self._build_lc_tool(t) for t in config.tools]

    # ── Public API ─────────────────────────────────────────────────────────

    def register_tools(self, tools: list[ToolDefinition]) -> None:
        """Replace the agent's tool list and invalidate the compiled graph."""
        self._tools = [self._build_lc_tool(t) for t in tools]
        self._graph = None

    async def run(self, input: AgentInput) -> AgentOutput:
        """Execute the agent and return the final ``AgentOutput``."""
        graph = self._compile()
        lc_messages = self._to_lc_messages(input.messages)
        result = await graph.ainvoke(
            {"messages": lc_messages},
            {"recursion_limit": self._config.max_iterations},
        )
        return self._from_lc_result(result)

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        """
        Stream execution events using LangGraph's ``astream_events`` v2.

        Mapping:
        - ``on_chat_model_stream`` → ``StreamEventType.TEXT_CHUNK``
        - ``on_tool_start``        → ``StreamEventType.TOOL_CALL``
        - ``on_tool_end``          → ``StreamEventType.TOOL_RESULT``
        """
        graph = self._compile()
        lc_messages = self._to_lc_messages(input.messages)
        async for raw_event in graph.astream_events(
            {"messages": lc_messages},
            {"recursion_limit": self._config.max_iterations},
            version="v2",
        ):
            mapped = self._map_stream_event(raw_event)
            if mapped is not None:
                yield mapped

    # ── Private helpers ────────────────────────────────────────────────────

    def _build_lc_tool(self, defn: ToolDefinition) -> StructuredTool:
        """Convert a ``ToolDefinition`` to a LangChain ``StructuredTool``."""
        from langchain_core.tools import StructuredTool
        from pydantic import BaseModel, create_model

        _type_map = {
            "string": str,
            "number": float,
            "integer": int,
            "boolean": bool,
            "array": list,
            "object": dict,
        }

        field_definitions: dict[str, Any] = {}
        props = defn.input_schema.properties or {}
        required_fields = set(defn.input_schema.required or [])
        for field_name, param in props.items():
            annotation = _type_map.get(param.type, str)
            if field_name not in required_fields:
                field_definitions[field_name] = (annotation | None, None)
            else:
                field_definitions[field_name] = (annotation, ...)

        InputModel: type[BaseModel] = create_model(  # noqa: N806
            f"{defn.name}_input", **field_definitions
        )

        tool_name = defn.name

        if _ExecutableTool is not None and isinstance(defn, _ExecutableTool):
            coroutine = defn.coroutine
        else:

            async def _noop(**kwargs: Any) -> str:
                return f"Tool '{tool_name}' invoked with: {json.dumps(kwargs)}"

            coroutine = _noop

        return StructuredTool.from_function(
            coroutine=coroutine,
            name=defn.name,
            description=defn.description,
            args_schema=InputModel,
        )

    def _compile(self) -> Any:
        """Compile (or return the cached) LangGraph react agent graph."""
        if self._graph is not None:
            return self._graph

        from langgraph.prebuilt import create_react_agent

        prompt = self._build_prompt()
        pre_hook = self._build_pre_model_hook(self._config.guardrails)
        post_hook = self._build_post_model_hook(self._config.guardrails)

        kwargs: dict[str, Any] = {
            "model": self._llm,
            "tools": self._tools,
            "prompt": prompt,
        }
        if pre_hook is not None:
            kwargs["pre_model_hook"] = pre_hook
        if post_hook is not None:
            kwargs["post_model_hook"] = post_hook

        self._graph = create_react_agent(**kwargs)
        return self._graph

    def _build_prompt(self) -> str:
        """Compose the effective system prompt from config."""
        default = (
            "You are a helpful AI assistant. "
            "Use the available tools to complete the task. "
            "When done, summarise what you did."
        )
        custom = self._config.system_prompt
        if not custom:
            return default
        if self._config.system_prompt_mode == "override":
            return custom
        return f"{default}\n\n{custom}"

    def _build_pre_model_hook(self, guardrails: GuardrailConfig) -> Any | None:
        """Build a LangGraph ``pre_model_hook`` that enforces input guardrails."""
        cfg = guardrails.input
        if not cfg.rules and cfg.max_prompt_length is None and not cfg.block_prompt_injection:
            return None

        max_len = cfg.max_prompt_length
        block_injection = cfg.block_prompt_injection

        def _pre_hook(state: dict[str, Any]) -> dict[str, Any]:
            from langchain_core.messages import HumanMessage

            messages = state.get("messages", [])
            last_human = next((m for m in reversed(messages) if isinstance(m, HumanMessage)), None)
            if last_human is None:
                return {}

            content = last_human.content if isinstance(last_human.content, str) else ""

            if max_len and len(content) > max_len:
                logger.warning("Input guardrail: prompt exceeds max length (%d chars)", max_len)
                content = content[:max_len]

            if block_injection:
                injection_patterns = [
                    "ignore previous instructions",
                    "disregard all prior",
                ]
                for pattern in injection_patterns:
                    if pattern.lower() in content.lower():
                        logger.warning("Input guardrail: possible prompt injection detected")
                        return {
                            "messages": [
                                HumanMessage(content="[BLOCKED: prompt injection pattern detected]")
                            ]
                        }

            return {}

        return _pre_hook

    def _build_post_model_hook(self, guardrails: GuardrailConfig) -> Any | None:
        """Build a LangGraph ``post_model_hook`` that enforces output guardrails."""
        cfg = guardrails.output
        if not cfg.rules and cfg.max_response_length is None and not cfg.redact_pii:
            return None

        max_len = cfg.max_response_length

        def _post_hook(state: dict[str, Any]) -> dict[str, Any]:
            from langchain_core.messages import AIMessage

            messages = state.get("messages", [])
            last_ai = next((m for m in reversed(messages) if isinstance(m, AIMessage)), None)
            if last_ai is None:
                return {}

            content = last_ai.content if isinstance(last_ai.content, str) else ""

            if max_len and len(content) > max_len:
                content = content[:max_len]
                return {"messages": [AIMessage(content=content)]}

            return {}

        return _post_hook

    def _to_lc_messages(self, messages: list[Message]) -> list[Any]:
        """Convert ``core.types.Message`` objects to LangChain message types."""
        from langchain_core.messages import (
            AIMessage,
            HumanMessage,
            SystemMessage,
            ToolMessage,
        )

        lc: list[Any] = []
        for msg in messages:
            if msg.role == MessageRole.SYSTEM:
                lc.append(SystemMessage(content=msg.content))
            elif msg.role == MessageRole.HUMAN:
                lc.append(HumanMessage(content=msg.content))
            elif msg.role == MessageRole.AI:
                lc.append(AIMessage(content=msg.content))
            elif msg.role == MessageRole.TOOL:
                lc.append(
                    ToolMessage(
                        content=msg.content,
                        tool_call_id=msg.tool_call_id or "",
                        name=msg.name,
                    )
                )
        return lc

    def _from_lc_result(self, result: dict[str, Any]) -> AgentOutput:
        """Convert a LangGraph ``ainvoke`` result dict to ``AgentOutput``."""
        from langchain_core.messages import AIMessage

        output_content = ""
        output_messages: list[Message] = []

        for lc_msg in result.get("messages", []):
            if isinstance(lc_msg, AIMessage):
                content = lc_msg.content
                text = content if isinstance(content, str) else json.dumps(content)
                output_content = text
                output_messages.append(Message(role=MessageRole.AI, content=text))

        structured = result.get("structured_response")

        return AgentOutput(
            content=output_content,
            messages=output_messages,
            structured_response=structured,
            artifacts=[
                AgentArtifact(
                    type="log",
                    title="Agent output",
                    content=output_content,
                )
            ],
        )

    def _map_stream_event(self, event: dict[str, Any]) -> StreamEvent | None:
        """Map a LangGraph ``astream_events`` v2 event dict to a ``StreamEvent``."""
        event_name: str = event.get("event", "")
        run_id: str | None = event.get("run_id")

        if event_name == "on_chat_model_stream":
            chunk = event.get("data", {}).get("chunk")
            content = getattr(chunk, "content", "") if chunk else ""
            if not content:
                return None
            return StreamEvent(
                type=StreamEventType.TEXT_CHUNK,
                data={"text": content},
                run_id=run_id,
            )

        if event_name == "on_tool_start":
            return StreamEvent(
                type=StreamEventType.TOOL_CALL,
                data={
                    "name": event.get("name"),
                    "input": event.get("data", {}).get("input"),
                },
                run_id=run_id,
            )

        if event_name == "on_tool_end":
            return StreamEvent(
                type=StreamEventType.TOOL_RESULT,
                data={
                    "name": event.get("name"),
                    "output": event.get("data", {}).get("output"),
                },
                run_id=run_id,
            )

        if event_name == "on_chain_start" and event.get("name") == "LangGraph":
            return StreamEvent(
                type=StreamEventType.AGENT_START,
                data={},
                run_id=run_id,
            )

        if event_name == "on_chain_end" and event.get("name") == "LangGraph":
            return StreamEvent(
                type=StreamEventType.AGENT_END,
                data={},
                run_id=run_id,
            )

        return None
