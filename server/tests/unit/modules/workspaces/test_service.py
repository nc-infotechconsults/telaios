"""tests/unit/modules/workspaces/test_service.py

Unit tests for :class:`telaios.modules.workspaces.service.WorkspaceService`.

Ported from
``data-api/src/__tests__/unit/services/workspace.service.test.ts``.

Strategy
--------
- Replace ``service._repo`` with an :class:`~unittest.mock.AsyncMock`.
- ``launch`` makes an external HTTP call via httpx; that is tested via a
  mock for the httpx client.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.workspaces.schemas import WorkspaceCreate, WorkspaceUpdate
from telaios.modules.workspaces.service import WorkspaceService
from telaios.utils.errors import NotFoundError

# ─── Helpers ──────────────────────────────────────────────────────────────


def _make_ws_row(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    name: str = "ws",
    status: str = "idle",
    config: dict | None = None,
) -> MagicMock:
    row = MagicMock()
    row.id = uid or uuid.uuid4()
    row.project_id = project_id or uuid.uuid4()
    row.name = name
    row.status = status
    row.container_id = None
    row.container_image = None
    row.ide_url = None
    row.ide_workspace_id = None
    row.config = config or {}
    row.created_by = None
    row.created_at = datetime.now(UTC)
    row.updated_at = datetime.now(UTC)
    row.deleted_at = None
    return row


def _make_service() -> tuple[WorkspaceService, AsyncMock]:
    session = AsyncMock()
    svc = WorkspaceService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ─── list_by_project ──────────────────────────────────────────────────────


class TestListByProject:
    @pytest.mark.asyncio
    async def test_returns_all_workspaces(self):
        svc, repo = _make_service()
        pid = uuid.uuid4()
        rows = [_make_ws_row(project_id=pid), _make_ws_row(project_id=pid)]
        repo.find_by_project.return_value = rows

        result = await svc.list_by_project(pid)
        assert len(result) == 2
        repo.find_by_project.assert_awaited_once_with(pid)

    @pytest.mark.asyncio
    async def test_empty_project_returns_empty_list(self):
        svc, repo = _make_service()
        repo.find_by_project.return_value = []
        result = await svc.list_by_project(uuid.uuid4())
        assert result == []


# ─── create ───────────────────────────────────────────────────────────────


class TestCreate:
    @pytest.mark.asyncio
    async def test_create_with_config(self):
        svc, repo = _make_service()
        pid = uuid.uuid4()
        creator = uuid.uuid4()
        row = _make_ws_row(project_id=pid, name="ws1", config={"env_vars": {"A": "B"}})
        repo.create.return_value = row

        from telaios.modules.workspaces.schemas import WorkspaceConfig

        dto = WorkspaceCreate(name="ws1", config=WorkspaceConfig(env_vars={"A": "B"}))
        result = await svc.create(pid, dto, creator)

        repo.create.assert_awaited_once_with(
            project_id=pid,
            name="ws1",
            config={"env_vars": {"A": "B"}},
            created_by=creator,
        )
        assert result.name == "ws1"

    @pytest.mark.asyncio
    async def test_create_without_config_uses_empty_dict(self):
        svc, repo = _make_service()
        pid = uuid.uuid4()
        row = _make_ws_row(project_id=pid)
        repo.create.return_value = row

        await svc.create(pid, WorkspaceCreate(name="ws"), None)
        _, kwargs = repo.create.call_args
        assert kwargs["config"] == {}


# ─── get ──────────────────────────────────────────────────────────────────


class TestGet:
    @pytest.mark.asyncio
    async def test_get_found(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        row = _make_ws_row(uid=uid)
        repo.find_by_id.return_value = row

        result = await svc.get(uid)
        assert result.id == uid

    @pytest.mark.asyncio
    async def test_get_not_found_raises(self):
        svc, repo = _make_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get(uuid.uuid4())


# ─── patch ────────────────────────────────────────────────────────────────


class TestPatch:
    @pytest.mark.asyncio
    async def test_patch_status(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        before = _make_ws_row(uid=uid)
        after = _make_ws_row(uid=uid, status="running")
        repo.find_by_id.return_value = before
        repo.update.return_value = after

        result = await svc.patch(uid, WorkspaceUpdate(status="running"))
        repo.update.assert_awaited_once_with(before, status="running")
        assert result.status == "running"

    @pytest.mark.asyncio
    async def test_patch_no_changes_skips_update(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        repo.find_by_id.return_value = _make_ws_row(uid=uid)

        await svc.patch(uid, WorkspaceUpdate())
        repo.update.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_patch_not_found_raises(self):
        svc, repo = _make_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch(uuid.uuid4(), WorkspaceUpdate(name="X"))


# ─── delete ───────────────────────────────────────────────────────────────


class TestDelete:
    @pytest.mark.asyncio
    async def test_delete_calls_soft_delete(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        row = _make_ws_row(uid=uid)
        repo.find_by_id.return_value = row

        await svc.delete(uid)
        repo.soft_delete.assert_awaited_once_with(row)

    @pytest.mark.asyncio
    async def test_delete_not_found_raises(self):
        svc, repo = _make_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete(uuid.uuid4())


# ─── launch ───────────────────────────────────────────────────────────────


class TestLaunch:
    @pytest.mark.asyncio
    async def test_launch_stores_ide_info(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        before = _make_ws_row(uid=uid)
        after = _make_ws_row(uid=uid, status="starting")
        after.ide_url = "https://ide.ex.com"
        after.ide_workspace_id = "ws-999"
        repo.find_by_id.return_value = before
        repo.update.return_value = after

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "ide_workspace_id": "ws-999",
            "ide_url": "https://ide.ex.com",
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch(
            "telaios.modules.workspaces.service.httpx.AsyncClient", return_value=mock_client
        ):
            result = await svc.launch(
                uid,
                ide_server_url="https://ide-server.ex.com",
                platform_api_url="https://api.ex.com",
                token="jwt",
            )

        repo.update.assert_awaited_once()
        _, kwargs = repo.update.call_args
        assert kwargs["ide_workspace_id"] == "ws-999"
        assert kwargs["ide_url"] == "https://ide.ex.com"
        assert kwargs["status"] == "starting"
        assert result.status == "starting"

    @pytest.mark.asyncio
    async def test_launch_not_found_raises(self):
        svc, repo = _make_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.launch(uuid.uuid4(), "http://ide", "http://api", "tok")
