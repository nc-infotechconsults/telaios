"""
domain/planning/persistence.py
------------------------------
Plan CRUD operations with checkpoint integration.

Uses the ``Checkpointer`` ABC from ``core.checkpoint`` to persist plan state.
Vendor-agnostic — no LangGraph or provider-specific imports.

Usage::

    from core.checkpoint import Checkpointer
    from domain.planning.persistence import PlanPersistence

    persistence = PlanPersistence(checkpointer)
    await persistence.save_plan("thread-1", {"tasks": [...]})
    plan = await persistence.load_plan("thread-1")
"""

from __future__ import annotations

from typing import Any

from telaios.core.checkpoint import Checkpointer


class PlanPersistence:
    """Handles plan CRUD operations with checkpoint integration."""

    def __init__(self, checkpointer: Checkpointer):
        self._checkpointer = checkpointer

    async def save_plan(self, thread_id: str, plan: dict[str, Any]) -> None:
        """Save a plan to the checkpoint store."""
        state = await self._checkpointer.get(thread_id) or {}
        state["plan"] = plan
        await self._checkpointer.put(thread_id, state)

    async def load_plan(self, thread_id: str) -> dict[str, Any] | None:
        """Load a plan from the checkpoint store."""
        state = await self._checkpointer.get(thread_id)
        if state is None:
            return None
        return state.get("plan")

    async def delete_plan(self, thread_id: str) -> None:
        """Delete a plan from the checkpoint store."""
        await self._checkpointer.delete(thread_id)

    async def update_task_status(
        self,
        thread_id: str,
        task_id: str,
        status: str,
        result: Any = None,
    ) -> None:
        """Update the status of a specific task within a plan."""
        state = await self._checkpointer.get(thread_id) or {}
        plan = state.get("plan", {})
        tasks = plan.get("tasks", [])
        for task in tasks:
            if task.get("id") == task_id:
                task["status"] = status
                if result is not None:
                    task["result"] = result
                break
        state["plan"] = plan
        await self._checkpointer.put(thread_id, state)

    async def get_task_status(self, thread_id: str, task_id: str) -> str | None:
        """Get the status of a specific task within a plan."""
        state = await self._checkpointer.get(thread_id)
        if state is None:
            return None
        plan = state.get("plan", {})
        for task in plan.get("tasks", []):
            if task.get("id") == task_id:
                return task.get("status")
        return None

    async def save_session_state(self, thread_id: str, key: str, value: Any) -> None:
        """Save arbitrary session state (e.g., phase, messages)."""
        state = await self._checkpointer.get(thread_id) or {}
        state[key] = value
        await self._checkpointer.put(thread_id, state)

    async def load_session_state(self, thread_id: str, key: str) -> Any:
        """Load arbitrary session state."""
        state = await self._checkpointer.get(thread_id)
        if state is None:
            return None
        return state.get(key)
