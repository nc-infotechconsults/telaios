"""tests/core/test_checkpoint.py — Tests for PostgresCheckpointer."""

from __future__ import annotations

import pytest

from telaios.core.checkpoint import PostgresCheckpointer


def test_postgres_checkpointer_instantiates_with_saver():
    """PostgresCheckpointer wraps a saver object."""
    import unittest.mock

    mock_saver = unittest.mock.MagicMock()
    cp = PostgresCheckpointer(mock_saver)
    assert cp is not None


def test_postgres_checkpointer_import_from_providers():
    """PostgresCheckpointer is importable from the legacy provider path."""
    from telaios.core.providers.langchain.checkpoint import PostgresCheckpointer as LC

    assert LC is PostgresCheckpointer


@pytest.mark.asyncio
async def test_postgres_checkpointer_with_memory_saver():
    """PostgresCheckpointer works with LangGraph's MemorySaver for testing."""
    pytest.importorskip("langgraph", reason="Phase 6: langgraph not installed")
    from langgraph.checkpoint.memory import MemorySaver

    saver = MemorySaver()
    cp = PostgresCheckpointer(saver)

    # get returns None for missing thread
    assert await cp.get("missing") is None

    # put and get roundtrip
    await cp.put("t1", {"key": "value"})
    state = await cp.get("t1")
    assert state is not None
    assert state["key"] == "value"

    # delete
    await cp.delete("t1")
    # After delete, get may return None or the saver's default
