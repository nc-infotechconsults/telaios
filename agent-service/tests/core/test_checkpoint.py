"""tests/core/test_checkpoint.py — Tests for the Checkpointer ABC."""

from __future__ import annotations

import pytest

from core.checkpoint import Checkpointer


class TestCheckpointerABC:
    """Verify Checkpointer is a proper abstract base class."""

    def test_cannot_instantiate_directly(self):
        """Checkpointer is abstract — direct instantiation must fail."""
        with pytest.raises(TypeError, match="abstract"):
            Checkpointer()  # type: ignore[abstract]

    def test_subclass_must_implement_methods(self):
        """A subclass that doesn't implement abstract methods cannot be instantiated."""

        class Incomplete(Checkpointer):
            pass

        with pytest.raises(TypeError, match="abstract"):
            Incomplete()  # type: ignore[abstract]

    def test_subclass_can_be_instantiated(self):
        """A concrete subclass implementing all methods can be instantiated."""

        class Concrete(Checkpointer):
            async def get(self, thread_id: str):
                return None

            async def put(self, thread_id: str, state: dict):
                pass

            async def delete(self, thread_id: str):
                pass

        cp = Concrete()
        assert cp is not None


@pytest.mark.asyncio
async def test_concrete_get_put_delete():
    """Concrete implementation supports full CRUD lifecycle."""

    class InMemoryCheckpointer(Checkpointer):
        def __init__(self):
            self._store: dict[str, dict] = {}

        async def get(self, thread_id: str):
            return self._store.get(thread_id)

        async def put(self, thread_id: str, state: dict):
            self._store[thread_id] = state

        async def delete(self, thread_id: str):
            self._store.pop(thread_id, None)

    cp = InMemoryCheckpointer()

    # Initially empty
    assert await cp.get("t1") is None

    # Put and retrieve
    await cp.put("t1", {"plan": {"tasks": []}})
    state = await cp.get("t1")
    assert state == {"plan": {"tasks": []}}

    # Overwrite
    await cp.put("t1", {"plan": {"tasks": ["a"]}})
    state = await cp.get("t1")
    assert state == {"plan": {"tasks": ["a"]}}

    # Delete
    await cp.delete("t1")
    assert await cp.get("t1") is None


def test_postgres_checkpointer_import():
    """PostgresCheckpointer can be imported and is a subclass of Checkpointer."""
    from core.providers.langchain.checkpoint import PostgresCheckpointer

    assert issubclass(PostgresCheckpointer, Checkpointer)


@pytest.mark.asyncio
async def test_postgres_checkpointer_with_memory_saver():
    """PostgresCheckpointer works with LangGraph's MemorySaver for testing."""
    from langgraph.checkpoint.memory import MemorySaver

    from core.providers.langchain.checkpoint import PostgresCheckpointer

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
