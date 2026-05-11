"""tests/unit/modules/plans/test_schemas.py

Unit tests for plans module schemas.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from telaios.modules.plans.schemas import (
    PlanCreate,
    PlanPatch,
    PlanRead,
    PlanStatus,
    ResumeResponse,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _make_plan_mock(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    title: str | None = "Test Plan",
    status: str = "draft",
    confirmed_at: datetime | None = None,
    failure_reason: str | None = None,
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.project_id = project_id or uuid.uuid4()
    m.title = title
    m.status = status
    m.confirmed_at = confirmed_at
    m.failure_reason = failure_reason
    m.created_at = _now()
    return m


# ── PlanCreate ────────────────────────────────────────────────────────────────


class TestPlanCreate:
    def test_defaults(self) -> None:
        dto = PlanCreate()
        assert dto.title is None
        assert dto.status == "draft"

    def test_with_title(self) -> None:
        dto = PlanCreate(title="Sprint 1")
        assert dto.title == "Sprint 1"

    def test_status_values(self) -> None:
        for s in ("draft", "confirmed", "executing", "completed", "failed"):
            dto = PlanCreate(status=s)  # type: ignore[arg-type]
            assert dto.status == s

    def test_invalid_status(self) -> None:
        with pytest.raises(ValidationError):
            PlanCreate(status="unknown")  # type: ignore[arg-type]


# ── PlanPatch ─────────────────────────────────────────────────────────────────


class TestPlanPatch:
    def test_all_optional(self) -> None:
        dto = PlanPatch()
        assert dto.title is None
        assert dto.status is None
        assert dto.confirmed_at is None
        assert dto.failure_reason is None

    def test_partial_patch(self) -> None:
        dto = PlanPatch(title="Updated")
        assert dto.title == "Updated"
        assert dto.status is None

    def test_status_patch(self) -> None:
        dto = PlanPatch(status="confirmed")
        assert dto.status == "confirmed"

    def test_confirmed_at_patch(self) -> None:
        now = _now()
        dto = PlanPatch(confirmed_at=now)
        assert dto.confirmed_at == now

    def test_failure_reason_patch(self) -> None:
        dto = PlanPatch(failure_reason="Out of tokens")
        assert dto.failure_reason == "Out of tokens"

    def test_invalid_status(self) -> None:
        with pytest.raises(ValidationError):
            PlanPatch(status="running")  # type: ignore[arg-type]

    def test_model_dump_exclude_unset(self) -> None:
        dto = PlanPatch(title="X")
        dumped = dto.model_dump(exclude_unset=True)
        assert dumped == {"title": "X"}


# ── PlanRead ──────────────────────────────────────────────────────────────────


class TestPlanRead:
    def test_from_attributes(self) -> None:
        plan_id = uuid.uuid4()
        project_id = uuid.uuid4()
        mock = _make_plan_mock(uid=plan_id, project_id=project_id)
        read = PlanRead.model_validate(mock)
        assert read.id == plan_id
        assert read.project_id == project_id
        assert read.title == "Test Plan"
        assert read.status == "draft"
        assert read.confirmed_at is None
        assert read.failure_reason is None

    def test_null_title(self) -> None:
        mock = _make_plan_mock(title=None)
        read = PlanRead.model_validate(mock)
        assert read.title is None

    def test_confirmed_plan(self) -> None:
        now = _now()
        mock = _make_plan_mock(status="confirmed", confirmed_at=now)
        read = PlanRead.model_validate(mock)
        assert read.status == "confirmed"
        assert read.confirmed_at == now

    def test_failed_plan(self) -> None:
        mock = _make_plan_mock(status="failed", failure_reason="LLM timeout")
        read = PlanRead.model_validate(mock)
        assert read.status == "failed"
        assert read.failure_reason == "LLM timeout"

    def test_serialises_uuid_fields(self) -> None:
        mock = _make_plan_mock()
        read = PlanRead.model_validate(mock)
        data = read.model_dump()
        assert isinstance(data["id"], uuid.UUID)
        assert isinstance(data["project_id"], uuid.UUID)


# ── ResumeResponse ────────────────────────────────────────────────────────────


class TestResumeResponse:
    def test_fields(self) -> None:
        plan_id = uuid.uuid4()
        resp = ResumeResponse(status="resumed", plan_id=plan_id)
        assert resp.status == "resumed"
        assert resp.plan_id == plan_id

    def test_required_fields(self) -> None:
        with pytest.raises(ValidationError):
            ResumeResponse(status="resumed")  # type: ignore[call-arg]


# ── PlanStatus literal ────────────────────────────────────────────────────────


class TestPlanStatusLiteral:
    def test_all_statuses_valid(self) -> None:
        statuses: list[PlanStatus] = ["draft", "confirmed", "executing", "completed", "failed"]
        assert len(statuses) == 5
