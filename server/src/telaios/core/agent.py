"""
src/core/agent.py
-----------------
Framework-agnostic agent abstraction.

This module defines only the ``Agent`` abstract base class.  Concrete
implementations (``LangChainAgent``, etc.) live under ``core/providers/``.
To obtain an agent instance, use the factory::

    from core.factory import create_agent
    from core.types import AgentConfig, LLMConfig

    agent = create_agent(AgentConfig(llm=LLMConfig(...)))

Callers should depend only on ``Agent``; they must never import a concrete
class directly, so the underlying framework can be swapped transparently.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from telaios.core.types import AgentInput, AgentOutput, StreamEvent

# ── Abstract contract ─────────────────────────────────────────────────────────


class Agent(ABC):
    """
    Framework-agnostic agent interface.

    Any implementation — LangChain, native, or otherwise — must satisfy these
    two methods.  Callers should depend only on ``Agent``, never on a concrete
    subclass, so that the underlying framework can be swapped transparently.

    Example — adding a native implementation::

        class NativeAgent(Agent):
            async def run(self, input: AgentInput) -> AgentOutput: ...
            async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]: ...
    """

    @abstractmethod
    async def run(self, input: AgentInput) -> AgentOutput:
        """Execute the agent and return the final output."""
        ...

    @abstractmethod
    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        """
        Stream execution events.

        Yields ``StreamEvent`` objects as they are produced:
        - ``TEXT_CHUNK``  — partial LLM output token(s)
        - ``TOOL_CALL``   — the agent is about to invoke a tool
        - ``TOOL_RESULT`` — a tool returned a result
        - ``AGENT_START`` / ``AGENT_END`` — lifecycle markers
        - ``ERROR``       — a recoverable error during execution
        """
        ...
        # Declare as an async generator so mypy recognises the return type.
        yield  # type: ignore[misc]
