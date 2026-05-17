"""tests/unit/modules/planner/test_service.py

Unit tests for PlannerService.

Strategy:
  - Build a real PlannerService via PlannerService.create() with a MemorySaver
    checkpointer and a mocked graph to avoid LLM/DB calls.
  - Test public methods (create_thread, get_state, send, confirm, refuse) by
    injecting a mock graph that controls what astream_events / aget_state return.
  - Test the private SSE-builder helpers directly.
  - Test _make_pause_from_snapshot directly.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.modules.planner.schemas import (
    PlannerThreadState,
    PlanResponseFormat,
    PlanStatus,
    PlanTask,
    Question,
)
from telaios.modules.planner.service import (
    PlannerService,
    _make_chunk,
    _make_done,
    _make_error,
    _make_pause_from_snapshot,
    _make_tool_call,
    _make_tool_result,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_service_with_mock_graph() -> tuple[PlannerService, MagicMock]:
    """Return a PlannerService wired to a mock graph."""
    mock_graph = MagicMock()
    mock_graph.aget_state = AsyncMock()
    mock_graph.astream_events = MagicMock()
    mock_graph.astream = MagicMock()
    svc = PlannerService(graph=mock_graph)
    return svc, mock_graph


def _empty_snapshot() -> MagicMock:
    snap = MagicMock()
    snap.values = {}
    snap.tasks = []
    return snap


def _paused_snapshot(plan: PlanResponseFormat) -> MagicMock:
    snap = MagicMock()
    snap.values = {"plan": plan, "status": PlanStatus.AWAITING_CONFIRMATION}
    snap.tasks = [MagicMock()]  # non-empty → paused
    return snap


async def _async_iter(items: list[Any]) -> AsyncIterator[Any]:
    for item in items:
        yield item


# ---------------------------------------------------------------------------
# SSE builder helpers
# ---------------------------------------------------------------------------


class TestSSEBuilderHelpers:
    def test_make_chunk(self) -> None:
        ev = _make_chunk("hello")
        assert ev.event == "chunk"
        assert ev.data.content == "hello"  # type: ignore[union-attr]

    def test_make_tool_call(self) -> None:
        ev = _make_tool_call("search_documents", {"query": "auth"})
        assert ev.event == "tool_call"
        assert ev.data.name == "search_documents"  # type: ignore[union-attr]
        assert ev.data.args == {"query": "auth"}  # type: ignore[union-attr]

    def test_make_tool_result(self) -> None:
        ev = _make_tool_result("search_documents", "doc content")
        assert ev.event == "tool_result"
        assert ev.data.content == "doc content"  # type: ignore[union-attr]

    def test_make_done(self) -> None:
        ev = _make_done(PlanStatus.ACCEPTED)
        assert ev.event == "done"
        assert ev.data.status == "accepted"  # type: ignore[union-attr]

    def test_make_error(self) -> None:
        ev = _make_error("something went wrong")
        assert ev.event == "error"
        assert ev.data.message == "something went wrong"  # type: ignore[union-attr]


# ---------------------------------------------------------------------------
# _make_pause_from_snapshot
# ---------------------------------------------------------------------------


class TestMakePauseFromSnapshot:
    def test_none_plan_returns_none(self) -> None:
        result = _make_pause_from_snapshot({})
        assert result is None

    def test_plan_with_questions_returns_pause_questions(self) -> None:
        q = Question(question="What is X?", type="free_form")
        plan = PlanResponseFormat(questions=[q])
        result = _make_pause_from_snapshot({"plan": plan})
        assert result is not None
        assert result.event == "pause"
        assert result.data.type == "questions"  # type: ignore[union-attr]

    def test_plan_with_tasks_returns_pause_plan_ready(self) -> None:
        t = PlanTask(name="T", short_description="s", details="d", category="c")
        plan = PlanResponseFormat(tasks=[t])
        result = _make_pause_from_snapshot({"plan": plan})
        assert result is not None
        assert result.event == "pause"
        assert result.data.type == "plan_ready"  # type: ignore[union-attr]

    def test_plan_with_empty_fields_returns_none(self) -> None:
        plan = PlanResponseFormat(response="just a response")
        result = _make_pause_from_snapshot({"plan": plan})
        assert result is None


# ---------------------------------------------------------------------------
# PlannerService.create_thread
# ---------------------------------------------------------------------------


class TestCreateThread:
    @pytest.mark.asyncio
    async def test_returns_string(self) -> None:
        svc, _ = _make_service_with_mock_graph()
        thread_id = await svc.create_thread("user-1")
        assert isinstance(thread_id, str)
        assert len(thread_id) > 0

    @pytest.mark.asyncio
    async def test_returns_unique_ids(self) -> None:
        svc, _ = _make_service_with_mock_graph()
        id1 = await svc.create_thread("user-1")
        id2 = await svc.create_thread("user-1")
        assert id1 != id2


# ---------------------------------------------------------------------------
# PlannerService.get_state
# ---------------------------------------------------------------------------


class TestGetState:
    @pytest.mark.asyncio
    async def test_empty_snapshot_returns_pending(self) -> None:
        svc, mock_graph = _make_service_with_mock_graph()
        mock_graph.aget_state.return_value = _empty_snapshot()

        result = await svc.get_state("thread-1", "user-1")

        assert isinstance(result, PlannerThreadState)
        assert result.thread_id == "thread-1"
        assert result.user_id == "user-1"
        assert result.status == PlanStatus.PENDING
        assert result.plan is None

    @pytest.mark.asyncio
    async def test_snapshot_with_plan_returns_plan(self) -> None:
        svc, mock_graph = _make_service_with_mock_graph()
        plan = PlanResponseFormat(response="Here is the plan")
        snap = MagicMock()
        snap.values = {"status": PlanStatus.AWAITING_CONFIRMATION, "plan": plan}
        snap.tasks = []
        mock_graph.aget_state.return_value = snap

        result = await svc.get_state("thread-1", "user-1")
        assert result.status == PlanStatus.AWAITING_CONFIRMATION
        assert result.plan is not None
        assert result.plan.response == "Here is the plan"

    @pytest.mark.asyncio
    async def test_none_snapshot_returns_pending(self) -> None:
        svc, mock_graph = _make_service_with_mock_graph()
        mock_graph.aget_state.return_value = None

        result = await svc.get_state("thread-1", "user-1")
        assert result.status == PlanStatus.PENDING


# ---------------------------------------------------------------------------
# PlannerService.confirm
# ---------------------------------------------------------------------------


class TestConfirm:
    @pytest.mark.asyncio
    async def test_confirm_streams_graph(self) -> None:
        svc, mock_graph = _make_service_with_mock_graph()

        async def _empty_astream(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            return
            yield  # make it an async generator

        mock_graph.astream = _empty_astream

        # Should complete without error
        await svc.confirm("thread-1", "user-1")


# ---------------------------------------------------------------------------
# PlannerService._emit_events (via send on new thread)
# ---------------------------------------------------------------------------


class TestEmitEvents:
    @pytest.mark.asyncio
    async def test_new_thread_emits_done(self) -> None:
        """For a new thread, after streaming, a 'done' event should be emitted."""
        svc, mock_graph = _make_service_with_mock_graph()

        # No existing state → new thread
        snap_empty = _empty_snapshot()
        snap_after = _empty_snapshot()
        snap_after.tasks = []
        snap_after.values = {"status": PlanStatus.PENDING}

        # aget_state: first call (to decide input type), second call (final state)
        mock_graph.aget_state.side_effect = [snap_empty, snap_after]

        # astream_events returns an empty async iterator → no LG events
        async def _no_events(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            return
            yield

        mock_graph.astream_events = _no_events

        events = []
        async for ev in svc._stream("thread-1", "user-1", "hello"):
            events.append(ev)

        assert len(events) >= 1
        assert events[-1].event == "done"

    @pytest.mark.asyncio
    async def test_paused_thread_emits_pause_and_done(self) -> None:
        """After streaming, if graph is paused, a 'pause' event is emitted before 'done'."""
        svc, mock_graph = _make_service_with_mock_graph()

        # First aget_state call: graph is already paused
        t = PlanTask(name="T", short_description="s", details="d", category="c")
        plan = PlanResponseFormat(tasks=[t])
        snap_paused = _paused_snapshot(plan)

        # Second aget_state call: final state (still paused)
        snap_final = _paused_snapshot(plan)

        mock_graph.aget_state.side_effect = [snap_paused, snap_final]

        async def _no_events(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            return
            yield

        mock_graph.astream_events = _no_events

        events = []
        async for ev in svc._stream("thread-1", "user-1", "confirm"):
            events.append(ev)

        event_names = [e.event for e in events]
        assert "pause" in event_names
        assert "done" in event_names
        # pause comes before done
        assert event_names.index("pause") < event_names.index("done")

    @pytest.mark.asyncio
    async def test_chunk_events_forwarded(self) -> None:
        """on_chat_model_stream events with text content yield 'chunk' SSE events."""
        svc, mock_graph = _make_service_with_mock_graph()

        snap_empty = _empty_snapshot()
        snap_after = MagicMock()
        snap_after.tasks = []
        snap_after.values = {"status": PlanStatus.PENDING}
        mock_graph.aget_state.side_effect = [snap_empty, snap_after]

        chunk = MagicMock()
        chunk.content = "hello world"

        async def _with_chunk(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": chunk},
                "name": "llm",
            }

        mock_graph.astream_events = _with_chunk

        events = []
        async for ev in svc._stream("thread-1", "user-1", "build me a plan"):
            events.append(ev)

        chunk_events = [e for e in events if e.event == "chunk"]
        assert len(chunk_events) == 1
        assert chunk_events[0].data.content == "hello world"  # type: ignore[union-attr]

    @pytest.mark.asyncio
    async def test_tool_call_events_forwarded(self) -> None:
        svc, mock_graph = _make_service_with_mock_graph()

        snap_empty = _empty_snapshot()
        snap_after = MagicMock()
        snap_after.tasks = []
        snap_after.values = {"status": PlanStatus.PENDING}
        mock_graph.aget_state.side_effect = [snap_empty, snap_after]

        async def _with_tool_call(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            yield {
                "event": "on_tool_start",
                "name": "search_documents",
                "data": {"input": {"query": "auth flow"}},
            }
            yield {
                "event": "on_tool_end",
                "name": "search_documents",
                "data": {"output": "doc results"},
            }

        mock_graph.astream_events = _with_tool_call

        events = []
        async for ev in svc._stream("thread-1", "user-1", "build me a plan"):
            events.append(ev)

        event_names = [e.event for e in events]
        assert "tool_call" in event_names
        assert "tool_result" in event_names

    @pytest.mark.asyncio
    async def test_graph_exception_yields_error_event(self) -> None:
        svc, mock_graph = _make_service_with_mock_graph()

        snap_empty = _empty_snapshot()
        mock_graph.aget_state.return_value = snap_empty

        async def _raises(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
            raise RuntimeError("graph exploded")
            yield  # make it an async generator

        mock_graph.astream_events = _raises

        events = []
        async for ev in svc._stream("thread-1", "user-1", "hi"):
            events.append(ev)

        error_events = [e for e in events if e.event == "error"]
        assert len(error_events) >= 1
        assert "graph exploded" in error_events[0].data.message  # type: ignore[union-attr]
