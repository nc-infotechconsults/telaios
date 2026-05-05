"""tests/domain/agents/test_document_copilot.py — Tests for document copilot."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from core.types import AgentInput, AgentOutput, Message, MessageRole
from domain.agents.document_copilot import DocumentCopilot, DocumentCopilotPhase


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


class MockInterruptHandle:
    """Mock interrupt handle for testing."""

    def __init__(self):
        self.interrupts: list[str] = []
        self._resume_value = "approved"

    def send_interrupt(self, message: str) -> None:
        self.interrupts.append(message)

    async def wait_for_resume(self):
        return self._resume_value


def _make_mock_agent(response: str = "Analysis result"):
    """Create a mock Agent."""
    agent = AsyncMock()
    agent.run = AsyncMock(return_value=AgentOutput(content=response))
    return agent


class TestDocumentCopilotPhase:
    """Tests for DocumentCopilotPhase enum."""

    def test_phases_exist(self):
        assert DocumentCopilotPhase.EXTRACT == "extract"
        assert DocumentCopilotPhase.ANALYZE == "analyze"
        assert DocumentCopilotPhase.CHUNK == "chunk"
        assert DocumentCopilotPhase.EMBED == "embed"
        assert DocumentCopilotPhase.WAITING_FOR_HUMAN == "waiting_for_human"
        assert DocumentCopilotPhase.COMPLETE == "complete"


class TestDocumentCopilot:
    """Tests for DocumentCopilot."""

    @pytest.mark.asyncio
    async def test_initial_phase(self):
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()

        copilot = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
            project_id="proj-1",
            document_id="doc-1",
        )
        assert copilot.phase == DocumentCopilotPhase.EXTRACT
        assert copilot.thread_id == "thread-1"

    @pytest.mark.asyncio
    async def test_resume_from_checkpoint(self):
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()

        # Pre-populate checkpoint with a later phase
        await checkpointer.put("thread-1", {
            "phase": "analyze",
            "document_text": "Some document text",
            "analysis_result": {},
            "chunks": [],
            "project_id": "proj-1",
            "document_id": "doc-1",
        })

        copilot = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
        )

        # Should resume from analyze phase
        result = await copilot.resume()
        assert result.content is not None

    @pytest.mark.asyncio
    async def test_get_state(self):
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()

        copilot = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
            project_id="proj-1",
            document_id="doc-1",
        )

        state = await copilot.get_state()
        assert state["phase"] == "extract"
        assert state["thread_id"] == "thread-1"
        assert state["project_id"] == "proj-1"
        assert state["document_id"] == "doc-1"
        assert state["chunks_count"] == 0

    @pytest.mark.asyncio
    async def test_save_state_persists(self):
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()

        copilot = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
        )

        # Save state manually
        copilot._phase = DocumentCopilotPhase.ANALYZE
        await copilot._save_state()

        # Verify persisted
        state = await checkpointer.get("thread-1")
        assert state is not None
        assert state["phase"] == "analyze"

    @pytest.mark.asyncio
    async def test_run_phase(self):
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()

        copilot = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
        )

        # Run a specific phase
        result = await copilot.run_phase(DocumentCopilotPhase.WAITING_FOR_HUMAN)
        assert interrupt.interrupts  # Should have sent an interrupt
        assert "complete" in result.content.lower() or "resumed" in result.content.lower()


class TestDocumentCopilotHITL:
    """Tests for HITL interrupt/resume."""

    @pytest.mark.asyncio
    async def test_interrupt_sends_message(self):
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()

        copilot = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
            document_id="doc-1",
        )

        # Set to waiting phase and save
        copilot._phase = DocumentCopilotPhase.WAITING_FOR_HUMAN
        await copilot._save_state()

        result = await copilot.resume()

        assert len(interrupt.interrupts) == 1
        assert "doc-1" in interrupt.interrupts[0]

    @pytest.mark.asyncio
    async def test_resume_after_interrupt(self):
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()
        interrupt._resume_value = "looks good"

        copilot = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
        )

        copilot._phase = DocumentCopilotPhase.WAITING_FOR_HUMAN
        await copilot._save_state()

        result = await copilot.resume()

        assert "looks good" in result.content
        assert copilot.phase == DocumentCopilotPhase.COMPLETE

        # Verify state persisted
        state = await checkpointer.get("thread-1")
        assert state["phase"] == "complete"


class TestDocumentCopilotStatePersistence:
    """Tests for state persistence across resumes."""

    @pytest.mark.asyncio
    async def test_state_survives_restart(self):
        """Simulate agent restart by creating a new copilot with same thread_id."""
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()

        # First session: save some state
        copilot1 = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
        )
        copilot1._document_text = "Extracted text content"
        copilot1._phase = DocumentCopilotPhase.ANALYZE
        await copilot1._save_state()

        # Second session: resume with new copilot instance
        copilot2 = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
        )

        # Load state from checkpoint
        state = await checkpointer.get("thread-1")
        assert state is not None
        assert state["phase"] == "analyze"
        assert state["document_text"] == "Extracted text content"

    @pytest.mark.asyncio
    async def test_different_threads_isolated(self):
        agent = _make_mock_agent()
        checkpointer = InMemoryCheckpointer()
        interrupt = MockInterruptHandle()

        copilot1 = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-1",
        )
        copilot1._phase = DocumentCopilotPhase.CHUNK
        await copilot1._save_state()

        copilot2 = DocumentCopilot(
            agent=agent,
            checkpointer=checkpointer,
            interrupt_handle=interrupt,
            thread_id="thread-2",
        )

        # Thread 2 should not be affected by thread 1
        state = await checkpointer.get("thread-2")
        assert state is None
