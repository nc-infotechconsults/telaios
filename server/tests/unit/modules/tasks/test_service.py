"""tests/unit/modules/tasks/test_service.py

Unit tests for TaskService and ArtifactService.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.modules.tasks.artifacts.schemas import ArtifactCreate, ArtifactRead
from telaios.modules.tasks.artifacts.service import ArtifactService
from telaios.modules.tasks.schemas import TaskCreate, TaskPatch, TaskRead
from telaios.modules.tasks.service import TaskService
from telaios.utils.errors import ConflictError, NotFoundError


def _now() -> datetime:
    return datetime.now(UTC)


def _make_task_mock(
    uid: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    title: str = "Do work",
    status: str = "pending",
    task_repositories: list | None = None,
    dependencies: list | None = None,
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.plan_id = plan_id or uuid.uuid4()
    m.title = title
    m.description = None
    m.type = "general"
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


def _make_artifact_mock(task_id: uuid.UUID | None = None, art_type: str = "diff") -> MagicMock:
    a = MagicMock()
    a.id = uuid.uuid4()
    a.task_id = task_id or uuid.uuid4()
    a.type = art_type
    a.title = "A diff"
    a.content = "--- a"
    a.content_type = "text/plain"
    a.artifact_metadata = None
    a.sort_order = 0
    a.created_at = _now()
    return a


def _make_task_service() -> tuple[TaskService, AsyncMock]:
    session = AsyncMock()
    svc = TaskService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


def _make_artifact_service() -> tuple[ArtifactService, AsyncMock]:
    session = AsyncMock()
    svc = ArtifactService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ── TaskService.list_by_plan ──────────────────────────────────────────────────


class TestListByPlan:
    @pytest.mark.asyncio
    async def test_empty(self) -> None:
        svc, repo = _make_task_service()
        repo.list_by_plan.return_value = []
        result = await svc.list_by_plan(uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_list(self) -> None:
        svc, repo = _make_task_service()
        plan_id = uuid.uuid4()
        mocks = [_make_task_mock(plan_id=plan_id) for _ in range(4)]
        repo.list_by_plan.return_value = mocks
        result = await svc.list_by_plan(plan_id)
        assert len(result) == 4
        assert all(isinstance(r, TaskRead) for r in result)
        repo.list_by_plan.assert_awaited_once_with(plan_id)

    @pytest.mark.asyncio
    async def test_relations_forwarded(self) -> None:
        svc, repo = _make_task_service()
        repo_rel = MagicMock()
        repo_rel.repository_id = uuid.uuid4()
        mock = _make_task_mock(task_repositories=[repo_rel])
        repo.list_by_plan.return_value = [mock]
        result = await svc.list_by_plan(uuid.uuid4())
        assert result[0].repository_ids == [repo_rel.repository_id]


# ── TaskService.get ───────────────────────────────────────────────────────────


class TestGetTask:
    @pytest.mark.asyncio
    async def test_found(self) -> None:
        svc, repo = _make_task_service()
        task_id = uuid.uuid4()
        mock = _make_task_mock(uid=task_id)
        repo.find.return_value = mock
        result = await svc.get(task_id)
        assert isinstance(result, TaskRead)
        assert result.id == task_id

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_task_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())


# ── TaskService.get_orm ───────────────────────────────────────────────────────


class TestGetOrmTask:
    @pytest.mark.asyncio
    async def test_returns_raw(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock()
        repo.find_with_deleted.return_value = mock
        result = await svc.get_orm(mock.id)
        assert result is mock

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_task_service()
        repo.find_with_deleted.return_value = None
        with pytest.raises(NotFoundError):
            await svc.get_orm(uuid.uuid4())


# ── TaskService.create ────────────────────────────────────────────────────────


class TestCreateTask:
    @pytest.mark.asyncio
    async def test_creates(self) -> None:
        svc, repo = _make_task_service()
        plan_id = uuid.uuid4()
        dto = TaskCreate(title="Write tests")
        mock = _make_task_mock(plan_id=plan_id, title="Write tests")
        repo.create.return_value = mock
        result = await svc.create(plan_id, dto)
        assert isinstance(result, TaskRead)
        repo.create.assert_awaited_once_with(
            plan_id=plan_id,
            repository_ids=[],
            depends_on_task_ids=[],
            title="Write tests",
            description=None,
            type="general",
            status="pending",
            execution_order=0,
            agent_profile_id=None,
        )

    @pytest.mark.asyncio
    async def test_with_relations(self) -> None:
        svc, repo = _make_task_service()
        plan_id = uuid.uuid4()
        repo_id = uuid.uuid4()
        dep_id = uuid.uuid4()
        dto = TaskCreate(
            title="T",
            repository_ids=[repo_id],
            depends_on_task_ids=[dep_id],
        )
        mock = _make_task_mock(plan_id=plan_id)
        repo.create.return_value = mock
        await svc.create(plan_id, dto)
        call_kwargs = repo.create.call_args.kwargs
        assert call_kwargs["repository_ids"] == [repo_id]
        assert call_kwargs["depends_on_task_ids"] == [dep_id]


# ── TaskService.patch ─────────────────────────────────────────────────────────


class TestPatchTask:
    @pytest.mark.asyncio
    async def test_patches_title(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock(title="Old")
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = TaskPatch(title="New")
        result = await svc.patch(mock.id, dto)
        assert isinstance(result, TaskRead)
        assert mock.title == "New"

    @pytest.mark.asyncio
    async def test_patches_status(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock(status="pending")
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = TaskPatch(status="in_progress")
        await svc.patch(mock.id, dto)
        assert mock.status == "in_progress"

    @pytest.mark.asyncio
    async def test_replaces_repositories(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock()
        repo.find.return_value = mock
        repo.save.return_value = mock
        new_repo_id = uuid.uuid4()
        dto = TaskPatch(repository_ids=[new_repo_id])
        await svc.patch(mock.id, dto)
        repo.replace_repositories.assert_awaited_once_with(mock.id, [new_repo_id])

    @pytest.mark.asyncio
    async def test_replaces_dependencies(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock()
        repo.find.return_value = mock
        repo.save.return_value = mock
        dep_id = uuid.uuid4()
        dto = TaskPatch(depends_on_task_ids=[dep_id])
        await svc.patch(mock.id, dto)
        repo.replace_dependencies.assert_awaited_once_with(mock.id, [dep_id])

    @pytest.mark.asyncio
    async def test_no_relation_calls_when_not_set(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock()
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = TaskPatch(title="Only title")
        await svc.patch(mock.id, dto)
        repo.replace_repositories.assert_not_awaited()
        repo.replace_dependencies.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_task_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), TaskPatch(title="X"))


# ── TaskService.retry ─────────────────────────────────────────────────────────


class TestRetry:
    @pytest.mark.asyncio
    async def test_retries_failed_task(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock(status="failed")
        repo.find.return_value = mock
        repo.save.return_value = mock
        result = await svc.retry(mock.id)
        assert mock.status == "pending"
        assert isinstance(result, TaskRead)

    @pytest.mark.asyncio
    async def test_retries_cancelled_task(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock(status="cancelled")
        repo.find.return_value = mock
        repo.save.return_value = mock
        await svc.retry(mock.id)
        assert mock.status == "pending"

    @pytest.mark.asyncio
    async def test_rejects_non_failed(self) -> None:
        svc, repo = _make_task_service()
        for status in ("pending", "ready", "in_progress", "done", "skipped"):
            mock = _make_task_mock(status=status)
            repo.find.return_value = mock
            with pytest.raises(ConflictError):
                await svc.retry(mock.id)

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_task_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.retry(uuid.uuid4())


# ── TaskService.cancel ────────────────────────────────────────────────────────


class TestCancelTask:
    @pytest.mark.asyncio
    async def test_cancels_pending(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock(status="pending")
        repo.find.return_value = mock
        repo.save.return_value = mock
        result = await svc.cancel(mock.id)
        assert mock.status == "cancelled"
        assert isinstance(result, TaskRead)

    @pytest.mark.asyncio
    async def test_cancels_in_progress(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock(status="in_progress")
        repo.find.return_value = mock
        repo.save.return_value = mock
        await svc.cancel(mock.id)
        assert mock.status == "cancelled"

    @pytest.mark.asyncio
    async def test_rejects_done(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock(status="done")
        repo.find.return_value = mock
        with pytest.raises(ConflictError):
            await svc.cancel(mock.id)

    @pytest.mark.asyncio
    async def test_rejects_already_cancelled(self) -> None:
        svc, repo = _make_task_service()
        mock = _make_task_mock(status="cancelled")
        repo.find.return_value = mock
        with pytest.raises(ConflictError):
            await svc.cancel(mock.id)

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_task_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.cancel(uuid.uuid4())


# ── TaskService.delete_by_plan ────────────────────────────────────────────────


class TestDeleteByPlan:
    @pytest.mark.asyncio
    async def test_delegates_to_repo(self) -> None:
        svc, repo = _make_task_service()
        repo.soft_delete_by_plan.return_value = 3
        result = await svc.delete_by_plan(uuid.uuid4())
        assert result == 3

    @pytest.mark.asyncio
    async def test_zero_deleted(self) -> None:
        svc, repo = _make_task_service()
        repo.soft_delete_by_plan.return_value = 0
        result = await svc.delete_by_plan(uuid.uuid4())
        assert result == 0


# ── TaskService.skip_dependent_tasks ─────────────────────────────────────────


class TestSkipDependentTasks:
    @pytest.mark.asyncio
    async def test_delegates_to_repo(self) -> None:
        svc, repo = _make_task_service()
        task_id = uuid.uuid4()
        repo.skip_dependent_tasks.return_value = 2
        result = await svc.skip_dependent_tasks(task_id)
        assert result == 2
        repo.skip_dependent_tasks.assert_awaited_once_with(task_id)


# ── TaskService.cancel_by_plan ────────────────────────────────────────────────


class TestCancelByPlan:
    @pytest.mark.asyncio
    async def test_delegates_to_repo(self) -> None:
        svc, repo = _make_task_service()
        plan_id = uuid.uuid4()
        repo.cancel_by_plan.return_value = 5
        result = await svc.cancel_by_plan(plan_id)
        assert result == 5
        repo.cancel_by_plan.assert_awaited_once_with(plan_id)


# ── ArtifactService.list_by_task ──────────────────────────────────────────────


class TestListArtifacts:
    @pytest.mark.asyncio
    async def test_empty(self) -> None:
        svc, repo = _make_artifact_service()
        repo.list_by_task.return_value = []
        result = await svc.list_by_task(uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_list(self) -> None:
        svc, repo = _make_artifact_service()
        task_id = uuid.uuid4()
        mocks = [_make_artifact_mock(task_id=task_id) for _ in range(2)]
        repo.list_by_task.return_value = mocks
        result = await svc.list_by_task(task_id)
        assert len(result) == 2
        assert all(isinstance(r, ArtifactRead) for r in result)


# ── ArtifactService.create_bulk ───────────────────────────────────────────────


class TestCreateBulkArtifacts:
    @pytest.mark.asyncio
    async def test_creates_each(self) -> None:
        svc, repo = _make_artifact_service()
        task_id = uuid.uuid4()
        artifacts = [
            ArtifactCreate(type="diff", title="d1", content="c1"),
            ArtifactCreate(type="log", title="l1", content="c2"),
        ]
        repo.create.side_effect = [
            _make_artifact_mock(task_id=task_id, art_type="diff"),
            _make_artifact_mock(task_id=task_id, art_type="log"),
        ]
        result = await svc.create_bulk(task_id, artifacts)
        assert len(result) == 2
        assert repo.create.await_count == 2

    @pytest.mark.asyncio
    async def test_empty_list(self) -> None:
        svc, repo = _make_artifact_service()
        result = await svc.create_bulk(uuid.uuid4(), [])
        assert result == []
        repo.create.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_passes_fields(self) -> None:
        svc, repo = _make_artifact_service()
        task_id = uuid.uuid4()
        dto = ArtifactCreate(
            type="review",
            title="Code review",
            content="LGTM",
            content_type="text/markdown",
            artifact_metadata={"approved": True},
            sort_order=2,
        )
        mock = _make_artifact_mock(task_id=task_id, art_type="review")
        repo.create.return_value = mock
        await svc.create_bulk(task_id, [dto])
        repo.create.assert_awaited_once_with(
            task_id=task_id,
            type="review",
            title="Code review",
            content="LGTM",
            content_type="text/markdown",
            artifact_metadata={"approved": True},
            sort_order=2,
        )
