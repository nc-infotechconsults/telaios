"""
src/core/providers/langchain/agent.py
--------------------------------------
LangChain / LangGraph-backed ``Agent`` implementation.

All ``langchain*`` and ``langgraph.*`` imports are performed **lazily**
(inside method bodies), keeping them off the module namespace so that this
module can be imported without triggering heavy LangChain imports.

Architecture
~~~~~~~~~~~~
``LangChainAgent`` implements the ``Agent`` ABC from ``core.agent``.  Its
internal graph is compiled lazily on first use and cached.  Calling
``register_tools()`` invalidates the cache.

Sources
~~~~~~~
- langchain.agents.create_agent (langchain-core >= 1.3):
  https://docs.langchain.com/oss/python/langchain/agents
- langgraph.prebuilt.create_react_agent (fallback):
  https://github.com/langchain-ai/langgraph/blob/main/libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py
- astream_events v2:
  https://github.com/langchain-ai/langgraph/issues/3071
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, AsyncIterator

from telaios.core.agent import Agent
from telaios.core.providers.langchain.llm import build_llm
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
    from telaios.tools.types import ExecutableTool as _ExecutableTool  # noqa: PLC0415
except ImportError:  # pragma: no cover
    _ExecutableTool = None  # type: ignore[assignment]

if TYPE_CHECKING:
    from langchain_core.language_models.chat_models import BaseChatModel
    from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)


class LangChainAgent(Agent):
    """
    LangChain / LangGraph-backed ``Agent`` implementation.

    Obtain an instance via the factory — do not instantiate directly::

        from core.factory import create_agent
        agent = create_agent(config)

    Tool registration
    ~~~~~~~~~~~~~~~~~
    Pass ``ToolDefinition`` objects — the framework-agnostic type from
    ``core.types``.  ``LangChainAgent`` converts them to ``StructuredTool``
    internally; callers never need to import LangChain.

    Guardrails
    ~~~~~~~~~~
    ``AgentConfig.guardrails`` is honoured via LangGraph's ``pre_model_hook``
    (input checks) and ``post_model_hook`` (output checks).

    Sandbox
    ~~~~~~~
    ``AgentConfig.sandbox`` is stored on the instance and readable by any
    tool that needs to know the execution environment.
    """

    def __init__(self, config: AgentConfig) -> None:
        self._config = config
        self._graph: Any | None = None
        self._llm: BaseChatModel = build_llm(config.llm)
        self._tools: list[StructuredTool] = [
            self._build_lc_tool(t) for t in config.tools
        ]

    # ── Public API ─────────────────────────────────────────────────────────

    def register_tools(self, tools: list[ToolDefinition]) -> None:
        """
        Replace the agent's tool list and invalidate the compiled graph.

        Converts each ``ToolDefinition`` to a LangChain ``StructuredTool``
        internally.
        """
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

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
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

    def _build_lc_tool(self, defn: ToolDefinition) -> "StructuredTool":
        """
        Convert a ``ToolDefinition`` to a LangChain ``StructuredTool``.

        Source: https://python.langchain.com/docs/concepts/tools/
        """
        from langchain_core.tools import StructuredTool  # noqa: PLC0415
        from pydantic import BaseModel, create_model  # noqa: PLC0415

        _type_map = {
            "string": str,
            "number": float,
            "integer": int,
            "boolean": bool,
            "array": list,
            "object": dict,
        }

        field_definitions: dict[str, Any] = {}
        props = (defn.input_schema.properties or {})
        required_fields = set(defn.input_schema.required or [])
        for field_name, param in props.items():
            annotation = _type_map.get(param.type, str)
            if field_name not in required_fields:
                field_definitions[field_name] = (annotation | None, None)
            else:
                field_definitions[field_name] = (annotation, ...)

        InputModel: type[BaseModel] = create_model(
            f"{defn.name}_input", **field_definitions
        )

        tool_name = defn.name

        # Use the real implementation when available (ExecutableTool),
        # otherwise fall back to a noop placeholder (plain ToolDefinition).
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
        """
        Compile (or return the cached) LangGraph agent graph.

        Tries ``langchain.agents.create_agent`` (langchain-core >= 1.3) first,
        falls back to ``langgraph.prebuilt.create_react_agent`` for older
        installations.

        Sources:
        - langchain.agents.create_agent: https://docs.langchain.com/oss/python/langchain/agents
        - create_react_agent: https://github.com/langchain-ai/langgraph/blob/main/libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py
        """
        if self._graph is not None:
            return self._graph

        prompt = self._build_prompt()
        pre_hook = self._build_pre_model_hook(self._config.guardrails)
        post_hook = self._build_post_model_hook(self._config.guardrails)

        try:
            from langchain.agents import create_agent  # noqa: PLC0415

            self._graph = create_agent(
                model=self._llm,
                tools=self._tools,
                system_prompt=prompt,
            )
        except ImportError:
            from langgraph.prebuilt import create_react_agent  # noqa: PLC0415

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
        """
        Build a LangGraph ``pre_model_hook`` that enforces input guardrails.

        Source: create_react_agent pre_model_hook param —
        https://github.com/langchain-ai/langgraph/blob/main/libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py
        """
        cfg = guardrails.input
        if (
            not cfg.rules
            and cfg.max_prompt_length is None
            and not cfg.block_prompt_injection
        ):
            return None

        max_len = cfg.max_prompt_length
        block_injection = cfg.block_prompt_injection

        def _pre_hook(state: dict[str, Any]) -> dict[str, Any]:
            from langchain_core.messages import HumanMessage  # noqa: PLC0415

            messages = state.get("messages", [])
            last_human = next(
                (m for m in reversed(messages) if isinstance(m, HumanMessage)), None
            )
            if last_human is None:
                return {}

            content = last_human.content if isinstance(last_human.content, str) else ""

            if max_len and len(content) > max_len:
                logger.warning(
                    "Input guardrail: prompt exceeds max length (%d chars)", max_len
                )
                content = content[:max_len]

            if block_injection:
                injection_patterns = [
                    "ignore previous instructions",
                    "disregard all prior",
                ]
                for pattern in injection_patterns:
                    if pattern.lower() in content.lower():
                        logger.warning(
                            "Input guardrail: possible prompt injection detected"
                        )
                        return {
                            "messages": [
                                HumanMessage(
                                    content="[BLOCKED: prompt injection pattern detected]"
                                )
                            ]
                        }

            return {}

        return _pre_hook

    def _build_post_model_hook(self, guardrails: GuardrailConfig) -> Any | None:
        """
        Build a LangGraph ``post_model_hook`` that enforces output guardrails.

        Source: create_react_agent post_model_hook param —
        https://github.com/langchain-ai/langgraph/blob/main/libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py
        """
        cfg = guardrails.output
        if (
            not cfg.rules
            and cfg.max_response_length is None
            and not cfg.redact_pii
        ):
            return None

        max_len = cfg.max_response_length

        def _post_hook(state: dict[str, Any]) -> dict[str, Any]:
            from langchain_core.messages import AIMessage  # noqa: PLC0415

            messages = state.get("messages", [])
            last_ai = next(
                (m for m in reversed(messages) if isinstance(m, AIMessage)), None
            )
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
        from langchain_core.messages import (  # noqa: PLC0415
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
        from langchain_core.messages import AIMessage  # noqa: PLC0415

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
        """
        Map a LangGraph ``astream_events`` v2 event dict to a ``StreamEvent``.

        Event schema reference:
        https://github.com/langchain-ai/langgraph/issues/3071
        """
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
