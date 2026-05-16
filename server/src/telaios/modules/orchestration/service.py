"""Orchestration service — wraps domain/orchestration for use by module routers.

Exposes :func:`start_execution` which is fire-and-forget (called via
``asyncio.create_task`` from plans.router ``POST /plans/{plan_id}/resume``).
"""

from __future__ import annotations

import asyncio
import logging

from telaios.core.checkpoint import PostgresCheckpointer

logger = logging.getLogger(__name__)

_checkpointer: PostgresCheckpointer | None = None


def set_checkpointer(cp: PostgresCheckpointer) -> None:
    """Register the active checkpointer (called during app startup)."""
    global _checkpointer
    _checkpointer = cp


async def start_execution(project_id: str, plan_id: str) -> None:
    """Fire-and-forget: mark plan execution started and hand off to the scheduler.

    Stores ``execution_status=started`` in the checkpoint so the planning
    session can observe progress.  The full DAG scheduler wiring is Phase 7+;
    for now this is a verified-reachable stub.
    """
    logger.info("start_execution: plan=%s project=%s", plan_id, project_id)
    if _checkpointer is not None:
        state = await _checkpointer.get(plan_id) or {}
        state.update({"project_id": project_id, "execution_status": "started"})
        await _checkpointer.put(plan_id, state)
    await asyncio.sleep(0)
