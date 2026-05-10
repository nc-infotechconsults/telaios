"""
src/core/checkpoint.py
----------------------
Vendor-agnostic checkpoint contract for persisting agent/thread state.

Domain code uses the ``Checkpointer`` ABC to save and restore plan sessions.
Concrete providers (e.g. LangGraph PostgresSaver) handle the actual storage
under ``core/providers/``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Checkpointer(ABC):
    """
    Abstract checkpointer for persisting agent/thread state.

    Concrete implementations live under ``core/providers/<framework>/checkpoint.py``.
    Domain code depends only on this ABC — never on a concrete provider.

    Example — domain usage::

        class PlanService:
            def __init__(self, checkpointer: Checkpointer):
                self._cp = checkpointer

            async def save_plan(self, thread_id: str, plan: dict):
                state = await self._cp.get(thread_id) or {}
                state["plan"] = plan
                await self._cp.put(thread_id, state)
    """

    @abstractmethod
    async def get(self, thread_id: str) -> dict[str, Any] | None:
        """Retrieve checkpoint state for a thread. Returns None if not found."""
        ...

    @abstractmethod
    async def put(self, thread_id: str, state: dict[str, Any]) -> None:
        """Persist checkpoint state for a thread."""
        ...

    @abstractmethod
    async def delete(self, thread_id: str) -> None:
        """Delete all checkpoint data for a thread."""
        ...
