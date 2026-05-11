"""
src/core/providers/langchain/orchestrator.py
---------------------------------------------
LangChain / LangGraph-backed ``Orchestrator`` implementation.

All ``langchain*`` imports are **lazy** (inside method bodies), consistent with
the rest of the LangChain provider package.

Architecture
~~~~~~~~~~~~
``LangChainOrchestrator`` inherits from both ``LangChainAgent`` and
``Orchestrator``.  This gives it the full LangChain agent execution loop
(``run()``, ``astream()``, ``_compile()``) plus the sub-agent management
contract (``add_sub_agent()``, ``remove_sub_agent()``).

Sub-agents are wrapped as LangChain ``StructuredTool`` objects with a single
``task_description: str`` input.  When the LLM calls such a tool, the
orchestrator invokes the underlying ``Agent.run()`` with a ``HumanMessage``
containing the task description and returns the text result.

Each sub-agent is a framework-agnostic ``Agent`` instance — it may use any
registered provider (langchain, openai-native, anthropic, …).  The
orchestrator does not care about the sub-agent's implementation.

Example::

    from core import create_orchestrator
    from core.types import AgentConfig, LLMConfig, SubAgentConfig

    config = AgentConfig(
        llm=LLMConfig(provider="openai", model="gpt-4o"),
        sub_agents=[
            SubAgentConfig(
                name="researcher",
                description="Researches topics on the web",
                agent_config=AgentConfig(
                    framework="langchain",
                    llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                ),
            ),
        ],
    )
    orchestrator = create_orchestrator(config)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from telaios.core.agent import Agent
from telaios.core.orchestrator import Orchestrator
from telaios.core.providers.langchain.agent import LangChainAgent
from telaios.core.types import AgentConfig, AgentInput, Message, MessageRole

if TYPE_CHECKING:
    from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)


class LangChainOrchestrator(LangChainAgent, Orchestrator):
    """
    LangChain / LangGraph-backed ``Orchestrator`` implementation.

    Sub-agents are registered via ``add_sub_agent()`` and exposed to the LLM
    as callable tools.  Adding or removing a sub-agent invalidates the
    compiled graph so the next ``run()`` / ``astream()`` call picks up the
    change.

    Obtain an instance via the factory::

        from core import create_orchestrator
        orchestrator = create_orchestrator(config)
    """

    def __init__(self, config: AgentConfig) -> None:
        super().__init__(config)
        # name → (agent, StructuredTool)
        self._sub_agent_map: dict[str, tuple[Agent, StructuredTool]] = {}

    # ── Orchestrator ABC ────────────────────────────────────────────────────

    def add_sub_agent(self, name: str, agent: Agent, description: str) -> None:
        """
        Register *agent* as a LangChain tool named *name*.

        The tool accepts a single ``task_description: str`` argument. When
        called, it invokes ``agent.run()`` and returns the text content.

        Calling this method invalidates the compiled graph.
        """
        tool = self._build_sub_agent_tool(name, description, agent)
        self._sub_agent_map[name] = (agent, tool)
        self._graph = None  # invalidate so _compile() picks up the new tool
        logger.debug("Registered sub-agent tool %r", name)

    def remove_sub_agent(self, name: str) -> None:
        """
        Deregister the sub-agent tool named *name*.

        Raises:
            KeyError: if no sub-agent with that name is registered.
        """
        if name not in self._sub_agent_map:
            raise KeyError(f"No sub-agent named {name!r} is registered.")
        del self._sub_agent_map[name]
        self._graph = None
        logger.debug("Removed sub-agent tool %r", name)

    # ── Override _compile to inject sub-agent tools ─────────────────────────

    def _compile(self) -> Any:
        """
        Compile the LangGraph with regular tools + sub-agent tools combined.
        """
        if self._graph is not None:
            return self._graph

        # Temporarily merge sub-agent tools into self._tools so the parent
        # _compile() picks them all up, then restore.
        sub_tools = [tool for (_agent, tool) in self._sub_agent_map.values()]
        original_tools = self._tools
        self._tools = original_tools + sub_tools
        try:
            graph = super()._compile()
        finally:
            self._tools = original_tools
        self._graph = graph
        return graph

    # ── Private helpers ─────────────────────────────────────────────────────

    def _build_sub_agent_tool(self, name: str, description: str, agent: Agent) -> StructuredTool:
        """
        Wrap *agent* as a ``StructuredTool`` with ``task_description: str`` input.

        The tool is framework-agnostic: it calls ``agent.run()`` and returns
        the ``AgentOutput.content`` string.  The sub-agent may use any provider.
        """
        from langchain_core.tools import StructuredTool
        from pydantic import BaseModel

        class _SubAgentInput(BaseModel):
            task_description: str

        async def _invoke(task_description: str) -> str:
            try:
                result = await agent.run(
                    AgentInput(messages=[Message(role=MessageRole.HUMAN, content=task_description)])
                )
                return result.content or "(no output)"
            except Exception as exc:
                logger.warning("Sub-agent %r raised an error: %s", name, exc)
                return f"Sub-agent error: {exc}"

        return StructuredTool.from_function(
            coroutine=_invoke,
            name=name,
            description=description,
            args_schema=_SubAgentInput,
        )
