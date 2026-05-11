"""tests/unit/modules/tasks/test_schemas.py

Unit tests for tasks module schemas (Task + Artifact).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from telaios.modules.tasks.artifacts.schemas import (
    ArtifactCreate,
    ArtifactRead,
    ArtifactType,
    BulkArtifactCreate,
)
from telaios.modules.tasks.schemas import (
    TaskCreate,
    TaskPatch,
    TaskRead,
    TaskStatus,
    TaskType,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _make_task_mock(
    uid: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    title: str = "Do something",
    task_type: str = "general",
    status: str = "pending",
    task_repositories: list | None = None,
    dependencies: list | None = None,
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.plan_id = plan_id or uuid.uuid4()
    m.title = title
    m.description = None
    m.type = task_type
    m.status = status
    m.execution_order = 0
    m.agent_profile_id = None
    m.assigned_instance_id = None
    m.result = None
    m.started_at = None
    m.completed_at = None
    m.task_metadata = None
    m.created_at = _now()
    m.updated_at = _now()
    m.task_repositories = task_repositories or []
    m.dependencies = dependencies or []
    return m


def _make_repo_rel(repo_id: uuid.UUID) -> MagicMock:
    r = MagicMock()
    r.repository_id = repo_id
    return r


def _make_dep_rel(dep_id: uuid.UUID) -> MagicMock:
    d = MagicMock()
    d.depends_on_task_id = dep_id
    return d


def _make_artifact_mock(
    uid: uuid.UUID | None = None, task_id: uuid.UUID | None = None
) -> MagicMock:
    a = MagicMock()
    a.id = uid or uuid.uuid4()
    a.task_id = task_id or uuid.uuid4()
    a.type = "diff"
    a.title = "My diff"
    a.content = "--- a\n+++ b"
    a.content_type = "text/plain"
    a.artifact_metadata = None
    a.sort_order = 0
    a.created_at = _now()
    return a


# ── TaskCreate ────────────────────────────────────────────────────────────────


class TestTaskCreate:
    def test_required_title(self) -> None:
        with pytest.raises(ValidationError):
            TaskCreate()  # type: ignore[call-arg]

    def test_defaults(self) -> None:
        dto = TaskCreate(title="Task 1")
        assert dto.description is None
        assert dto.type == "general"
        assert dto.status == "pending"
        assert dto.execution_order == 0
        assert dto.agent_profile_id is None
        assert dto.repository_ids == []
        assert dto.depends_on_task_ids == []

    def test_valid_types(self) -> None:
        for t in ("code", "test", "review", "general", "knowledge", "infra"):
            dto = TaskCreate(title="T", type=t)  # type: ignore[arg-type]
            assert dto.type == t

    def test_invalid_type(self) -> None:
        with pytest.raises(ValidationError):
            TaskCreate(title="T", type="invalid")  # type: ignore[arg-type]

    def test_valid_statuses(self) -> None:
        for s in ("pending", "ready", "in_progress", "done", "failed", "cancelled", "skipped"):
            dto = TaskCreate(title="T", status=s)  # type: ignore[arg-type]
            assert dto.status == s

    def test_invalid_status(self) -> None:
        with pytest.raises(ValidationError):
            TaskCreate(title="T", status="unknown")  # type: ignore[arg-type]

    def test_with_relations(self) -> None:
        repo_id = uuid.uuid4()
        dep_id = uuid.uuid4()
        dto = TaskCreate(
            title="T",
            repository_ids=[repo_id],
            depends_on_task_ids=[dep_id],
        )
        assert dto.repository_ids == [repo_id]
        assert dto.depends_on_task_ids == [dep_id]


# ── TaskPatch ─────────────────────────────────────────────────────────────────


class TestTaskPatch:
    def test_all_optional(self) -> None:
        dto = TaskPatch()
        assert dto.title is None
        assert dto.type is None
        assert dto.status is None

    def test_partial(self) -> None:
        dto = TaskPatch(title="Updated", status="in_progress")
        assert dto.title == "Updated"
        assert dto.status == "in_progress"
        assert dto.type is None

    def test_model_dump_exclude_unset(self) -> None:
        dto = TaskPatch(status="done")
        dumped = dto.model_dump(exclude_unset=True)
        assert dumped == {"status": "done"}

    def test_result_field(self) -> None:
        dto = TaskPatch(result="Task completed successfully")
        assert dto.result == "Task completed successfully"

    def test_task_metadata(self) -> None:
        dto = TaskPatch(task_metadata={"key": "value"})
        assert dto.task_metadata == {"key": "value"}

    def test_replace_repository_ids(self) -> None:
        repo_id = uuid.uuid4()
        dto = TaskPatch(repository_ids=[repo_id])
        assert dto.repository_ids == [repo_id]

    def test_replace_depends_on(self) -> None:
        dep_id = uuid.uuid4()
        dto = TaskPatch(depends_on_task_ids=[dep_id])
        assert dto.depends_on_task_ids == [dep_id]


# ── TaskRead ──────────────────────────────────────────────────────────────────


class TestTaskRead:
    def test_from_orm_no_relations(self) -> None:
        task_id = uuid.uuid4()
        plan_id = uuid.uuid4()
        mock = _make_task_mock(uid=task_id, plan_id=plan_id, title="Build feature")
        read = TaskRead.from_orm_with_relations(mock)
        assert read.id == task_id
        assert read.plan_id == plan_id
        assert read.title == "Build feature"
        assert read.repository_ids == []
        assert read.depends_on_task_ids == []

    def test_from_orm_with_repositories(self) -> None:
        repo_id = uuid.uuid4()
        mock = _make_task_mock(task_repositories=[_make_repo_rel(repo_id)])
        read = TaskRead.from_orm_with_relations(mock)
        assert read.repository_ids == [repo_id]

    def test_from_orm_with_dependencies(self) -> None:
        dep_id = uuid.uuid4()
        mock = _make_task_mock(dependencies=[_make_dep_rel(dep_id)])
        read = TaskRead.from_orm_with_relations(mock)
        assert read.depends_on_task_ids == [dep_id]

    def test_from_orm_multiple_relations(self) -> None:
        repo_ids = [uuid.uuid4(), uuid.uuid4()]
        dep_ids = [uuid.uuid4()]
        mock = _make_task_mock(
            task_repositories=[_make_repo_rel(r) for r in repo_ids],
            dependencies=[_make_dep_rel(d) for d in dep_ids],
        )
        read = TaskRead.from_orm_with_relations(mock)
        assert set(read.repository_ids) == set(repo_ids)
        assert set(read.depends_on_task_ids) == set(dep_ids)

    def test_default_lists(self) -> None:
        mock = _make_task_mock()
        read = TaskRead.from_orm_with_relations(mock)
        assert read.repository_ids == []
        assert read.depends_on_task_ids == []


# ── TaskType / TaskStatus literals ────────────────────────────────────────────


class TestLiterals:
    def test_task_types(self) -> None:
        types: list[TaskType] = ["code", "test", "review", "general", "knowledge", "infra"]
        assert len(types) == 6

    def test_task_statuses(self) -> None:
        statuses: list[TaskStatus] = [
            "pending",
            "ready",
            "in_progress",
            "done",
            "failed",
            "cancelled",
            "skipped",
        ]
        assert len(statuses) == 7


# ── ArtifactCreate ────────────────────────────────────────────────────────────


class TestArtifactCreate:
    def test_required_fields(self) -> None:
        dto = ArtifactCreate(type="diff", title="Patch", content="--- a\n+++ b")
        assert dto.type == "diff"
        assert dto.title == "Patch"
        assert dto.content == "--- a\n+++ b"
        assert dto.content_type == "text/plain"
        assert dto.artifact_metadata is None
        assert dto.sort_order == 0

    def test_missing_required(self) -> None:
        with pytest.raises(ValidationError):
            ArtifactCreate()  # type: ignore[call-arg]

    def test_valid_types(self) -> None:
        for t in ("diff", "test_result", "review", "log", "file", "link"):
            dto = ArtifactCreate(type=t, title="T", content="C")  # type: ignore[arg-type]
            assert dto.type == t

    def test_invalid_type(self) -> None:
        with pytest.raises(ValidationError):
            ArtifactCreate(type="unknown", title="T", content="C")  # type: ignore[arg-type]

    def test_with_metadata(self) -> None:
        dto = ArtifactCreate(
            type="log",
            title="Run log",
            content="...",
            artifact_metadata={"lines": 100},
        )
        assert dto.artifact_metadata == {"lines": 100}


# ── BulkArtifactCreate ────────────────────────────────────────────────────────


class TestBulkArtifactCreate:
    def test_empty_list(self) -> None:
        dto = BulkArtifactCreate(artifacts=[])
        assert dto.artifacts == []

    def test_multiple(self) -> None:
        items = [ArtifactCreate(type="diff", title=f"diff-{i}", content="...") for i in range(3)]
        dto = BulkArtifactCreate(artifacts=items)
        assert len(dto.artifacts) == 3


# ── ArtifactRead ──────────────────────────────────────────────────────────────


class TestArtifactRead:
    def test_from_attributes(self) -> None:
        art_id = uuid.uuid4()
        task_id = uuid.uuid4()
        mock = _make_artifact_mock(uid=art_id, task_id=task_id)
        read = ArtifactRead.model_validate(mock)
        assert read.id == art_id
        assert read.task_id == task_id
        assert read.type == "diff"
        assert read.title == "My diff"
        assert read.content == "--- a\n+++ b"
        assert read.content_type == "text/plain"
        assert read.artifact_metadata is None
        assert read.sort_order == 0


# ── ArtifactType literal ──────────────────────────────────────────────────────


class TestArtifactTypeLiteral:
    def test_all_types(self) -> None:
        types: list[ArtifactType] = ["diff", "test_result", "review", "log", "file", "link"]
        assert len(types) == 6
