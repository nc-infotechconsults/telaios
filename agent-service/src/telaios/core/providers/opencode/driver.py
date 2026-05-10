"""
core/providers/opencode/driver.py
---------------------------------
OpenCode agent driver.

Delegates directly to the agent's ``run`` / ``astream`` methods — OpenCode
agents are already framework-agnostic via the ``core.Agent`` ABC.
"""

from __future__ import annotations

from typing import AsyncIterator

from telaios.core.agent import Agent
from telaios.core.types import AgentInput, AgentOutput, StreamEvent
from telaios.domain.orchestration.drivers import AgentDriver


class OpenCodeDriver(AgentDriver):
    """Driver for executing agents via the OpenCode platform."""

    async def execute(self, agent: Agent, input: AgentInput) -> AgentOutput:
        return await agent.run(input)

    async def stream(self, agent: Agent, input: AgentInput) -> AsyncIterator[StreamEvent]:
        async for event in agent.astream(input):
            yield event
