from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Literal, Optional

from agent_service.core.agent_framework.context import AgentContext

logger = logging.getLogger(__name__)

AgentStatus = Literal["idle", "initializing", "ready", "running", "error", "stopped"]


class AgentResult:
    """Structured result produced by the last successful execute() call."""

    def __init__(
        self,
        success: bool,
        output: str,
        error: Optional[str] = None,
        artifacts: Optional[list] = None,
    ) -> None:
        self.success = success
        self.output = output
        self.error = error
        self.artifacts = artifacts or []


class BaseAgent(ABC):
    """
    Abstract base class for all agents.

    Subclasses must implement three lifecycle hooks:
      - on_init(ctx)    — one-time setup
      - on_execute(ctx) — main work for a single execution cycle
      - on_cleanup()    — release resources
    """

    def __init__(self, id: str, type: str) -> None:
        self.id = id
        self.type = type
        self._status: AgentStatus = "idle"
        self._result: Optional[AgentResult] = None

    def get_status(self) -> AgentStatus:
        return self._status

    def get_result(self) -> Optional[AgentResult]:
        return self._result

    async def init(self, ctx: AgentContext) -> None:
        if self._status == "ready":
            return
        if self._status == "running":
            raise RuntimeError(f"Agent {self.id} is already running; cannot re-init.")
        self._status = "initializing"
        try:
            await self.on_init(ctx)
            self._status = "ready"
        except Exception:
            self._status = "error"
            raise

    async def execute(self, ctx: AgentContext) -> None:
        if self._status != "ready":
            raise RuntimeError(
                f'Agent {self.id} must be in "ready" state to execute (current: {self._status}).'
            )
        self._status = "running"
        try:
            await self.on_execute(ctx)
            self._status = "ready"
        except Exception:
            self._status = "error"
            raise

    async def cleanup(self) -> None:
        try:
            await self.on_cleanup()
        finally:
            self._status = "stopped"

    @abstractmethod
    async def on_init(self, ctx: AgentContext) -> None:
        ...

    @abstractmethod
    async def on_execute(self, ctx: AgentContext) -> None:
        ...

    @abstractmethod
    async def on_cleanup(self) -> None:
        ...
