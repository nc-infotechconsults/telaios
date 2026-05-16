"""
src/core/checkpoint.py
----------------------
LangGraph checkpoint implementation for persisting agent/thread state.

``PostgresCheckpointer`` wraps any LangGraph ``BaseCheckpointSaver``
(e.g. ``AsyncPostgresSaver``, ``MemorySaver``) and provides a simple
``get`` / ``put`` / ``delete`` interface for plan sessions.

Usage::

    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from telaios.core.checkpoint import PostgresCheckpointer

    async with AsyncPostgresSaver.from_conn_string(dsn) as saver:
        cp = PostgresCheckpointer(saver)
        await cp.put("thread-1", {"plan": {...}})
        state = await cp.get("thread-1")
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from langgraph.checkpoint.base import BaseCheckpointSaver


class PostgresCheckpointer:
    """
    Wraps any LangGraph ``BaseCheckpointSaver`` for plan session persistence.

    Accepts ``AsyncPostgresSaver``, ``MemorySaver``, or any other
    ``BaseCheckpointSaver`` and delegates to its ``aget`` / ``aput`` /
    ``adelete_thread`` methods.
    """

    def __init__(self, saver: BaseCheckpointSaver) -> None:
        self._saver = saver

    def _make_config(self, thread_id: str) -> dict[str, Any]:
        """Build the LangGraph config dict for a thread."""
        return {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}

    async def get(self, thread_id: str) -> dict[str, Any] | None:
        """Retrieve checkpoint state for a thread. Returns None if not found."""
        config = self._make_config(thread_id)
        checkpoint_tuple = await self._saver.aget(config)
        if checkpoint_tuple is None:
            return None
        # aget() returns CheckpointTuple (NamedTuple); .checkpoint is the raw dict
        return cast(dict[str, Any], checkpoint_tuple.checkpoint.get("channel_values", {}))

    async def put(self, thread_id: str, state: dict[str, Any]) -> None:
        """Persist checkpoint state for a thread."""
        from langgraph.checkpoint.base import (
            CheckpointMetadata,
            empty_checkpoint,
        )

        config = self._make_config(thread_id)

        channel_versions: dict[str, int] = {}
        for idx, key in enumerate(state):
            channel_versions[key] = idx + 1

        checkpoint = {
            **empty_checkpoint(),
            "channel_values": state,
            "channel_versions": channel_versions,
        }
        metadata: CheckpointMetadata = {
            "source": "update",
            "step": -1,
            "writes": None,
            "parents": {},
        }
        await self._saver.aput(config, checkpoint, metadata, channel_versions)

    async def delete(self, thread_id: str) -> None:
        """Delete all checkpoint data for a thread."""
        await self._saver.adelete_thread(thread_id)
