"""
core/providers/github_copilot/driver.py
---------------------------------------
GitHub Copilot agent driver.

Delegates directly to the agent's ``run`` / ``astream`` methods — the
GitHub Copilot platform uses the same ``core.Agent`` interface.
"""

from __future__ import annotations

from typing import AsyncIterator

from core.agent import Agent
from core.types import AgentInput, AgentOutput, StreamEvent
from domain.orchestration.drivers import AgentDriver


class GitHubCopilotDriver(AgentDriver):
    """Driver for executing agents via the GitHub Copilot platform."""

    async def execute(self, agent: Agent, input: AgentInput) -> AgentOutput:
        return await agent.run(input)

    async def stream(self, agent: Agent, input: AgentInput) -> AsyncIterator[StreamEvent]:
        async for event in agent.astream(input):
            yield event
