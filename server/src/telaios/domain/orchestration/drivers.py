"""
domain/orchestration/drivers.py
-------------------------------
Driver interface for executing agents on different platforms.

Both built-in drivers (OpenCode, GitHub Copilot) delegate directly to the
agent's ``run`` / ``astream`` methods — no platform-specific logic needed
beyond this thin wrapper.

Usage::

    from telaios.domain.orchestration.drivers import OpenCodeDriver

    driver = OpenCodeDriver()
    result = await driver.execute(agent, input)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from telaios.core.types import AgentInput, AgentOutput, StreamEvent


class AgentDriver(ABC):
    """
    Abstract driver for executing agents on a specific platform.

    Both current implementations (OpenCode, GitHub Copilot) are thin
    wrappers — override ``execute`` or ``stream`` only for platform-specific
    behaviour.
    """

    @abstractmethod
    async def execute(self, agent: Any, input: AgentInput) -> AgentOutput:
        """Execute an agent using the driver's platform."""
        ...

    @abstractmethod
    async def stream(self, agent: Any, input: AgentInput) -> AsyncIterator[StreamEvent]:
        """Stream execution events from the agent."""
        ...
        yield  # type: ignore[misc]


class OpenCodeDriver(AgentDriver):
    """Driver for executing agents via the OpenCode platform."""

    async def execute(self, agent: Any, input: AgentInput) -> AgentOutput:
        return await agent.run(input)

    async def stream(self, agent: Any, input: AgentInput) -> AsyncIterator[StreamEvent]:
        async for event in agent.astream(input):
            yield event


class GitHubCopilotDriver(AgentDriver):
    """Driver for executing agents via the GitHub Copilot platform."""

    async def execute(self, agent: Any, input: AgentInput) -> AgentOutput:
        return await agent.run(input)

    async def stream(self, agent: Any, input: AgentInput) -> AsyncIterator[StreamEvent]:
        async for event in agent.astream(input):
            yield event
