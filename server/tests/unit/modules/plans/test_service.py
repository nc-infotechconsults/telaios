"""tests/unit/modules/plans/test_service.py

Unit tests for PlanService.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.modules.plans.schemas import PlanCreate, PlanPatch, PlanRead
from telaios.modules.plans.service import PlanService
from telaios.utils.errors import NotFoundError


def _now() -> datetime:
    return datetime.now(UTC)


def _make_plan_mock(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    title: str | None = "Plan A",
    status: str = "draft",
) -> MagicMock:
    m = MagicMock()
    m.id = uid or uuid.uuid4()
    m.project_id = project_id or uuid.uuid4()
    m.title = title
    m.status = status
    m.confirmed_at = None
    m.failure_reason = None
    m.created_at = _now()
    return m


def _make_service() -> tuple[PlanService, AsyncMock]:
    session = AsyncMock()
    svc = PlanService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ── list_by_project ───────────────────────────────────────────────────────────


class TestListByProject:
    @pytest.mark.asyncio
    async def test_empty(self) -> None:
        svc, repo = _make_service()
        repo.list_by_project.return_value = []
        result = await svc.list_by_project(uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_list(self) -> None:
        svc, repo = _make_service()
        project_id = uuid.uuid4()
        mocks = [_make_plan_mock(project_id=project_id) for _ in range(3)]
        repo.list_by_project.return_value = mocks
        result = await svc.list_by_project(project_id)
        assert len(result) == 3
        assert all(isinstance(r, PlanRead) for r in result)
        repo.list_by_project.assert_awaited_once_with(project_id)

    @pytest.mark.asyncio
    async def test_values_preserved(self) -> None:
        svc, repo = _make_service()
        plan_id = uuid.uuid4()
        mock = _make_plan_mock(uid=plan_id, title="My Plan", status="confirmed")
        repo.list_by_project.return_value = [mock]
        result = await svc.list_by_project(uuid.uuid4())
        assert result[0].id == plan_id
        assert result[0].title == "My Plan"
        assert result[0].status == "confirmed"


# ── get ───────────────────────────────────────────────────────────────────────


class TestGet:
    @pytest.mark.asyncio
    async def test_found(self) -> None:
        svc, repo = _make_service()
        plan_id = uuid.uuid4()
        mock = _make_plan_mock(uid=plan_id)
        repo.find.return_value = mock
        result = await svc.get(plan_id)
        assert isinstance(result, PlanRead)
        assert result.id == plan_id

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_calls_repo_with_id(self) -> None:
        svc, repo = _make_service()
        plan_id = uuid.uuid4()
        repo.find.return_value = _make_plan_mock(uid=plan_id)
        await svc.get(plan_id)
        repo.find.assert_awaited_once_with(plan_id)


# ── get_orm ───────────────────────────────────────────────────────────────────


class TestGetOrm:
    @pytest.mark.asyncio
    async def test_returns_raw_orm(self) -> None:
        svc, repo = _make_service()
        mock = _make_plan_mock()
        repo.find_with_deleted.return_value = mock
        result = await svc.get_orm(mock.id)
        assert result is mock

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_service()
        repo.find_with_deleted.return_value = None
        with pytest.raises(NotFoundError):
            await svc.get_orm(uuid.uuid4())


# ── create ────────────────────────────────────────────────────────────────────


class TestCreate:
    @pytest.mark.asyncio
    async def test_creates_plan(self) -> None:
        svc, repo = _make_service()
        project_id = uuid.uuid4()
        dto = PlanCreate(title="New Plan", status="draft")
        mock = _make_plan_mock(project_id=project_id, title="New Plan")
        repo.create.return_value = mock
        result = await svc.create(project_id, dto)
        assert isinstance(result, PlanRead)
        repo.create.assert_awaited_once_with(
            project_id=project_id,
            title="New Plan",
            status="draft",
        )

    @pytest.mark.asyncio
    async def test_no_title(self) -> None:
        svc, repo = _make_service()
        project_id = uuid.uuid4()
        dto = PlanCreate()
        mock = _make_plan_mock(project_id=project_id, title=None)
        repo.create.return_value = mock
        result = await svc.create(project_id, dto)
        assert result.title is None
        repo.create.assert_awaited_once_with(
            project_id=project_id,
            title=None,
            status="draft",
        )


# ── patch ─────────────────────────────────────────────────────────────────────


class TestPatch:
    @pytest.mark.asyncio
    async def test_patches_title(self) -> None:
        svc, repo = _make_service()
        plan_id = uuid.uuid4()
        mock = _make_plan_mock(uid=plan_id, title="Old Title")
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = PlanPatch(title="New Title")
        result = await svc.patch(plan_id, dto)
        assert isinstance(result, PlanRead)
        assert mock.title == "New Title"
        repo.save.assert_awaited_once_with(mock)

    @pytest.mark.asyncio
    async def test_patches_status(self) -> None:
        svc, repo = _make_service()
        mock = _make_plan_mock(status="draft")
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = PlanPatch(status="confirmed")
        await svc.patch(mock.id, dto)
        assert mock.status == "confirmed"

    @pytest.mark.asyncio
    async def test_exclude_unset(self) -> None:
        """Only set fields should be applied to the ORM object."""
        svc, repo = _make_service()
        mock = _make_plan_mock(title="Keep", status="draft")
        repo.find.return_value = mock
        repo.save.return_value = mock
        dto = PlanPatch(status="executing")
        await svc.patch(mock.id, dto)
        # title should remain unchanged
        assert mock.title == "Keep"
        assert mock.status == "executing"

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), PlanPatch(title="X"))


# ── delete ────────────────────────────────────────────────────────────────────


class TestDelete:
    @pytest.mark.asyncio
    async def test_soft_deletes(self) -> None:
        svc, repo = _make_service()
        mock = _make_plan_mock()
        repo.find.return_value = mock
        await svc.delete(mock.id)
        repo.soft_delete.assert_awaited_once_with(mock)

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        svc, repo = _make_service()
        repo.find.return_value = None
        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())
