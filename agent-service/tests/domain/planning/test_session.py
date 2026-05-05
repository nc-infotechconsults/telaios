"""tests/domain/planning/test_session.py — Tests for plan session lifecycle."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from core.types import LLMConfig, Message, MessageRole
from domain.planning.persistence import PlanPersistence
from domain.planning.session import PlanSession


class InMemoryCheckpointer:
    """Simple in-memory checkpointer for testing."""

    def __init__(self):
        self._store: dict[str, dict] = {}

    async def get(self, thread_id: str):
        return self._store.get(thread_id)

    async def put(self, thread_id: str, state: dict):
        self._store[thread_id] = state

    async def delete(self, thread_id: str):
        self._store.pop(thread_id, None)


def _make_mock_llm(response_content: str = '{"message": "Plan ready", "ready_for_plan": true, "plan": {"tasks": [{"id": "t1", "description": "Do thing"}]}}'):
    """Create a mock LLM that returns a fixed response."""
    llm = AsyncMock()
    response = MagicMock()
    response.content = response_content
    llm.invoke = AsyncMock(return_value=response)
    return llm


@pytest.fixture
def persistence():
    return PlanPersistence(InMemoryCheckpointer())


@pytest.fixture
def llm_config():
    return LLMConfig(provider="openai", model="gpt-4o", api_key="test-key")


class TestPlanSession:
    """Tests for PlanSession."""

    @pytest.mark.asyncio
    async def test_start_returns_greeting(self, persistence, llm_config):
        session = PlanSession("thread-1", llm_config, persistence)
        greeting = await session.start()
        assert "planning assistant" in greeting.lower()

    @pytest.mark.asyncio
    async def test_start_saves_phase(self, persistence, llm_config):
        session = PlanSession("thread-1", llm_config, persistence)
        await session.start()
        phase = await persistence.load_session_state("thread-1", "phase")
        assert phase == "interview"

    @pytest.mark.asyncio
    async def test_load_plan_returns_none_when_empty(self, persistence, llm_config):
        session = PlanSession("thread-1", llm_config, persistence)
        result = await session.load_plan()
        assert result is None

    @pytest.mark.asyncio
    async def test_get_plan_returns_none_when_empty(self, persistence, llm_config):
        session = PlanSession("thread-1", llm_config, persistence)
        result = await session.get_plan()
        assert result is None

    @pytest.mark.asyncio
    async def test_phase_property(self, persistence, llm_config):
        session = PlanSession("thread-1", llm_config, persistence)
        assert session.phase == "interview"
        session.phase = "review"
        assert session.phase == "review"

    @pytest.mark.asyncio
    async def test_create_plan_persists(self, persistence, llm_config):
        session = PlanSession("thread-1", llm_config, persistence)
        session._llm = _make_mock_llm()

        plan = await session.create_plan("Build a REST API")
        assert len(plan.tasks) >= 1

        # Verify persisted
        loaded = await persistence.load_plan("thread-1")
        assert loaded is not None
        assert len(loaded.get("tasks", [])) >= 1

    @pytest.mark.asyncio
    async def test_session_state_roundtrip(self, persistence, llm_config):
        session = PlanSession("thread-1", llm_config, persistence)
        await persistence.save_session_state("thread-1", "custom_key", "custom_value")
        result = await persistence.load_session_state("thread-1", "custom_key")
        assert result == "custom_value"
