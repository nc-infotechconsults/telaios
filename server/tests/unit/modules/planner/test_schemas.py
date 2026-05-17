"""tests/unit/modules/planner/test_schemas.py

Unit tests for planner Pydantic schemas.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from telaios.modules.planner.schemas import (
    ChunkEventData,
    CreateThreadResponse,
    DoneEventData,
    ErrorEventData,
    PausePlanReadyEventData,
    PauseQuestionsEventData,
    PlannerThreadState,
    PlanResponseFormat,
    PlanStatus,
    PlanTask,
    Question,
    RefuseRequest,
    SendMessageRequest,
    SSEEvent,
    ToolCallEventData,
    ToolResultEventData,
)

# ---------------------------------------------------------------------------
# PlanStatus
# ---------------------------------------------------------------------------


class TestPlanStatus:
    def test_values(self) -> None:
        assert PlanStatus.PENDING == "pending"
        assert PlanStatus.INTERVIEWING == "interviewing"
        assert PlanStatus.AWAITING_CONFIRMATION == "awaiting_confirmation"
        assert PlanStatus.ACCEPTED == "accepted"
        assert PlanStatus.REFUSED == "refused"


# ---------------------------------------------------------------------------
# PlanResponseFormat defaults
# ---------------------------------------------------------------------------


class TestPlanResponseFormat:
    def test_defaults(self) -> None:
        prf = PlanResponseFormat()
        assert prf.tasks is None
        assert prf.questions == []
        assert prf.response is None

    def test_has_questions(self) -> None:
        q = Question(question="Why?", type="free_form")
        prf = PlanResponseFormat(questions=[q])
        assert len(prf.questions) == 1
        assert prf.questions[0].question == "Why?"

    def test_has_tasks(self) -> None:
        t = PlanTask(
            name="Task 1",
            short_description="Short",
            details="Detailed description",
            category="backend",
        )
        prf = PlanResponseFormat(tasks=[t])
        assert prf.tasks is not None
        assert len(prf.tasks) == 1
        assert prf.tasks[0].name == "Task 1"


# ---------------------------------------------------------------------------
# PlanTask
# ---------------------------------------------------------------------------


class TestPlanTask:
    def test_auto_id(self) -> None:
        t = PlanTask(
            name="T",
            short_description="s",
            details="d",
            category="c",
        )
        assert isinstance(t.id, str)
        assert len(t.id) > 0

    def test_dependencies_default_empty(self) -> None:
        t = PlanTask(name="T", short_description="s", details="d", category="c")
        assert t.dependencies == []


# ---------------------------------------------------------------------------
# Question
# ---------------------------------------------------------------------------


class TestQuestion:
    def test_auto_id(self) -> None:
        q = Question(question="q?", type="yes_no")
        assert isinstance(q.id, str)
        assert len(q.id) > 0

    def test_options_default_none(self) -> None:
        q = Question(question="q?", type="free_form")
        assert q.options is None


# ---------------------------------------------------------------------------
# HTTP schemas
# ---------------------------------------------------------------------------


class TestHTTPSchemas:
    def test_create_thread_response(self) -> None:
        r = CreateThreadResponse(thread_id="abc-123")
        assert r.thread_id == "abc-123"

    def test_send_message_request_min_length(self) -> None:
        with pytest.raises(ValidationError):
            SendMessageRequest(content="")

    def test_send_message_request_valid(self) -> None:
        r = SendMessageRequest(content="hello")
        assert r.content == "hello"

    def test_refuse_request_min_length(self) -> None:
        with pytest.raises(ValidationError):
            RefuseRequest(reason="")

    def test_refuse_request_valid(self) -> None:
        r = RefuseRequest(reason="too vague")
        assert r.reason == "too vague"


# ---------------------------------------------------------------------------
# SSE event data schemas
# ---------------------------------------------------------------------------


class TestSSEEventData:
    def test_chunk_event_data(self) -> None:
        d = ChunkEventData(content="hello")
        assert d.content == "hello"

    def test_tool_call_event_data_defaults(self) -> None:
        d = ToolCallEventData(name="search_documents")
        assert d.args == {}

    def test_tool_result_event_data(self) -> None:
        d = ToolResultEventData(name="search_documents", content="result text")
        assert d.content == "result text"

    def test_done_event_data(self) -> None:
        d = DoneEventData(status="accepted")
        assert d.status == "accepted"

    def test_error_event_data(self) -> None:
        d = ErrorEventData(message="oops")
        assert d.message == "oops"

    def test_pause_questions_event_data(self) -> None:
        q = Question(question="q?", type="free_form")
        d = PauseQuestionsEventData(questions=[q])
        assert d.type == "questions"
        assert len(d.questions) == 1

    def test_pause_plan_ready_event_data(self) -> None:
        t = PlanTask(name="T", short_description="s", details="d", category="c")
        d = PausePlanReadyEventData(tasks=[t], response="here is your plan")
        assert d.type == "plan_ready"
        assert len(d.tasks) == 1
        assert d.response == "here is your plan"


# ---------------------------------------------------------------------------
# SSEEvent union
# ---------------------------------------------------------------------------


class TestSSEEvent:
    def test_chunk_event(self) -> None:
        ev = SSEEvent(event="chunk", data=ChunkEventData(content="tok"))
        assert ev.event == "chunk"
        assert isinstance(ev.data, ChunkEventData)

    def test_done_event(self) -> None:
        ev = SSEEvent(event="done", data=DoneEventData(status="accepted"))
        assert ev.event == "done"

    def test_error_event(self) -> None:
        ev = SSEEvent(event="error", data=ErrorEventData(message="err"))
        assert ev.event == "error"

    def test_pause_questions_event(self) -> None:
        q = Question(question="q?", type="free_form")
        ev = SSEEvent(
            event="pause",
            data=PauseQuestionsEventData(questions=[q]),
        )
        assert ev.event == "pause"
        assert isinstance(ev.data, PauseQuestionsEventData)

    def test_model_dump_data(self) -> None:
        ev = SSEEvent(event="chunk", data=ChunkEventData(content="x"))
        d = ev.data.model_dump()
        assert d == {"content": "x"}


# ---------------------------------------------------------------------------
# PlannerThreadState
# ---------------------------------------------------------------------------


class TestPlannerThreadState:
    def test_defaults(self) -> None:
        s = PlannerThreadState(
            thread_id="t1",
            user_id="u1",
            status=PlanStatus.PENDING,
        )
        assert s.plan is None
        assert s.status == PlanStatus.PENDING

    def test_with_plan(self) -> None:
        plan = PlanResponseFormat(response="some response")
        s = PlannerThreadState(
            thread_id="t1",
            user_id="u1",
            status=PlanStatus.INTERVIEWING,
            plan=plan,
        )
        assert s.plan is not None
        assert s.plan.response == "some response"
