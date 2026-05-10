"""
domain/orchestration/drivers.py
-------------------------------
Vendor driver interface for orchestration.

Defines the ``AgentDriver`` ABC that concrete platform drivers must implement.
Domain code uses this interface — never imports a concrete driver directly.

Usage::

    from domain.orchestration.drivers import AgentDriver

    class MyDriver(AgentDriver):
        async def execute(self, agent, input): ...
        async def stream(self, agent, input): ...
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator

from telaios.core.agent import Agent
from telaios.core.types import AgentInput, AgentOutput, StreamEvent


class AgentDriver(ABC):
    """
    Abstract driver for executing agents on a specific platform.

    Concrete implementations (OpenCode, GitHub Copilot) handle the
    platform-specific invocation details.  Domain code depends only on
    this ABC — never on a concrete driver.
    """

    @abstractmethod
    async def execute(self, agent: Agent, input: AgentInput) -> AgentOutput:
        """Execute an agent using the driver's platform."""
        ...

    @abstractmethod
    async def stream(self, agent: Agent, input: AgentInput) -> AsyncIterator[StreamEvent]:
        """Stream execution events from the agent."""
        ...
        yield  # type: ignore[misc]
