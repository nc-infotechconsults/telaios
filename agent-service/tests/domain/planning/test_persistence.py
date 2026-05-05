"""tests/domain/planning/test_persistence.py — Tests for plan CRUD."""

from __future__ import annotations

import pytest

from core.checkpoint import Checkpointer
from domain.planning.persistence import PlanPersistence


class InMemoryCheckpointer(Checkpointer):
    """Simple in-memory checkpointer for testing."""

    def __init__(self):
        self._store: dict[str, dict] = {}

    async def get(self, thread_id: str):
        return self._store.get(thread_id)

    async def put(self, thread_id: str, state: dict):
        self._store[thread_id] = state

    async def delete(self, thread_id: str):
        self._store.pop(thread_id, None)


@pytest.fixture
def checkpointer():
    return InMemoryCheckpointer()


@pytest.fixture
def persistence(checkpointer):
    return PlanPersistence(checkpointer)


class TestPlanPersistence:
    """Tests for PlanPersistence."""

    @pytest.mark.asyncio
    async def test_save_and_load_plan(self, persistence):
        plan = {"tasks": [{"id": "t1", "description": "Test"}]}
        await persistence.save_plan("thread-1", plan)
        loaded = await persistence.load_plan("thread-1")
        assert loaded == plan

    @pytest.mark.asyncio
    async def test_load_nonexistent_plan(self, persistence):
        result = await persistence.load_plan("missing")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_plan(self, persistence):
        await persistence.save_plan("thread-1", {"tasks": []})
        await persistence.delete_plan("thread-1")
        assert await persistence.load_plan("thread-1") is None

    @pytest.mark.asyncio
    async def test_update_task_status(self, persistence):
        plan = {"tasks": [{"id": "t1", "description": "Test", "status": "pending"}]}
        await persistence.save_plan("thread-1", plan)

        await persistence.update_task_status("thread-1", "t1", "completed", result="done")

        loaded = await persistence.load_plan("thread-1")
        assert loaded["tasks"][0]["status"] == "completed"
        assert loaded["tasks"][0]["result"] == "done"

    @pytest.mark.asyncio
    async def test_update_nonexistent_task(self, persistence):
        plan = {"tasks": [{"id": "t1", "description": "Test"}]}
        await persistence.save_plan("thread-1", plan)

        # Should not crash
        await persistence.update_task_status("thread-1", "missing", "completed")

        loaded = await persistence.load_plan("thread-1")
        assert loaded["tasks"][0].get("status") is None

    @pytest.mark.asyncio
    async def test_get_task_status(self, persistence):
        plan = {"tasks": [{"id": "t1", "description": "Test", "status": "in_progress"}]}
        await persistence.save_plan("thread-1", plan)

        status = await persistence.get_task_status("thread-1", "t1")
        assert status == "in_progress"

    @pytest.mark.asyncio
    async def test_get_task_status_missing(self, persistence):
        assert await persistence.get_task_status("thread-1", "missing") is None

    @pytest.mark.asyncio
    async def test_save_and_load_session_state(self, persistence):
        await persistence.save_session_state("thread-1", "phase", "review")
        phase = await persistence.load_session_state("thread-1", "phase")
        assert phase == "review"

    @pytest.mark.asyncio
    async def test_load_session_state_missing(self, persistence):
        result = await persistence.load_session_state("thread-1", "phase")
        assert result is None
