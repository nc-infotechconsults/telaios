"""
core/providers/langchain/checkpoint.py
---------------------------------------
LangGraph checkpoint adapter wrapping ``BaseCheckpointSaver``.

Reuses the same Postgres tables used by LangGraph's own checkpointers —
zero data migration needed.  Domain code depends only on the ``Checkpointer``
ABC.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from langgraph.checkpoint.base import BaseCheckpointSaver

from telaios.core.checkpoint import Checkpointer


class PostgresCheckpointer(Checkpointer):
    """
    Wraps any LangGraph ``BaseCheckpointSaver`` to implement the
    ``Checkpointer`` ABC.

    Accepts a ``BaseCheckpointSaver`` instance (e.g. ``AsyncPostgresSaver``,
    ``MemorySaver``) and delegates to its ``aget`` / ``aput`` / ``adelete_thread``
    methods.

    Example::

        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        async with AsyncPostgresSaver.from_conn_string(dsn) as saver:
            cp = PostgresCheckpointer(saver)
            await cp.put("thread-1", {"plan": {...}})
            state = await cp.get("thread-1")
    """

    def __init__(self, saver: BaseCheckpointSaver):
        self._saver = saver

    def _make_config(self, thread_id: str) -> dict[str, Any]:
        """Build the LangGraph config dict for a thread."""
        return {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}

    async def get(self, thread_id: str) -> dict[str, Any] | None:
        config = self._make_config(thread_id)
        checkpoint = await self._saver.aget(config)
        if checkpoint is None:
            return None
        return cast(dict[str, Any], checkpoint.get("channel_values", {}))

    async def put(self, thread_id: str, state: dict[str, Any]) -> None:
        from langgraph.checkpoint.base import (
            CheckpointMetadata,
            empty_checkpoint,
        )

        config = self._make_config(thread_id)

        # Build version mapping: each key in state gets a monotonically
        # increasing version number.  LangGraph stores blobs keyed by
        # (thread_id, ns, channel_key, version).
        channel_versions: dict[str, int] = {}
        for idx, key in enumerate(state):
            channel_versions[key] = idx + 1

        checkpoint = {
            **empty_checkpoint(),
            "channel_values": state,
            "channel_versions": channel_versions,
        }
        metadata: CheckpointMetadata = {"source": "domain", "step": -1}
        await self._saver.aput(config, checkpoint, metadata, channel_versions)

    async def delete(self, thread_id: str) -> None:
        await self._saver.adelete_thread(thread_id)
