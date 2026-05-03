"""
src/core/orchestrator.py
------------------------
Framework-agnostic orchestrator abstraction.

An ``Orchestrator`` is an ``Agent`` that additionally manages a set of
*sub-agents*.  Each sub-agent is exposed to the LLM as a callable tool; the
orchestrator dispatches sub-tasks to them and aggregates results.

The concrete implementation lives under ``core/providers/``.  To obtain an
instance, use the factory::

    from core.factory import create_orchestrator
    from core.types import AgentConfig, LLMConfig, SubAgentConfig

    config = AgentConfig(
        llm=LLMConfig(provider="openai", model="gpt-4o"),
        sub_agents=[
            SubAgentConfig(
                name="code_reviewer",
                description="Reviews code for correctness and style",
                agent_config=AgentConfig(
                    llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                ),
            ),
        ],
    )
    orchestrator = create_orchestrator(config)

Sub-agents registered at construction time (via ``config.sub_agents``) are
wired automatically by the factory.  Additional sub-agents can be added or
removed after construction via ``add_sub_agent()`` / ``remove_sub_agent()``.

Framework independence
~~~~~~~~~~~~~~~~~~~~~~
This module imports only from ``core.agent`` and ``core.types`` — no
``langchain*`` or other framework symbols appear here.  Concrete classes
(``LangChainOrchestrator``, etc.) live under ``core/providers/``.
"""

from __future__ import annotations

from abc import abstractmethod

from core.agent import Agent
from core.types import AgentInput, AgentOutput, StreamEvent  # noqa: F401 — re-exported for convenience


class Orchestrator(Agent):
    """
    An ``Agent`` that coordinates other agents as sub-tasks.

    Sub-agents are registered via ``add_sub_agent()`` and are exposed to the
    LLM as callable tools.  From the outside, an ``Orchestrator`` satisfies
    the same interface as any other ``Agent`` — ``run()`` and ``astream()``.

    Each sub-agent is an independent ``Agent`` instance and may use a
    *different* framework than the orchestrator itself (e.g. an Anthropic
    orchestrator can have an OpenAI sub-agent).  The orchestrator is
    framework-agnostic with respect to its sub-agents.

    Life-cycle::

        orchestrator = create_orchestrator(config)
        # Sub-agents from config.sub_agents are already wired.
        # You can add more at runtime:
        orchestrator.add_sub_agent("search", search_agent, "Searches the web")
        result = await orchestrator.run(input)
    """

    @abstractmethod
    def add_sub_agent(self, name: str, agent: Agent, description: str) -> None:
        """
        Register *agent* as a tool named *name* available to the LLM.

        Args:
            name:        Tool name the LLM calls (must be unique among sub-agents).
            agent:       Any ``Agent`` implementation — framework does not matter.
            description: Tool description shown to the LLM.
        """
        ...

    @abstractmethod
    def remove_sub_agent(self, name: str) -> None:
        """
        Deregister the sub-agent tool named *name*.

        Raises:
            KeyError: if no sub-agent with that name is registered.
        """
        ...
