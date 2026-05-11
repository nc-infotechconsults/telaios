"""tests/unit/modules/repositories/test_service.py

Unit tests for RepositoryService and helper functions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.repositories.schemas import (
    RepositoryCreate,
    RepositoryPatch,
    TestRepositoryDto,
)
from telaios.modules.repositories.service import (
    RepositoryService,
    _slugify_creds,
)
from telaios.modules.repositories.service import (
    test_repository as check_repository,
)
from telaios.utils.errors import NotFoundError

# ─── Helpers ──────────────────────────────────────────────────────────────


def _make_repo_row(
    uid: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    name: str = "my-repo",
    credentials: str | None = None,
) -> MagicMock:
    row = MagicMock()
    row.id = uid or uuid.uuid4()
    row.project_id = project_id or uuid.uuid4()
    row.name = name
    row.remote_url = "https://github.com/org/repo"
    row.branch = "main"
    row.auth_type = "none"
    row.provider_type = "git"
    row.bucket_name = None
    row.region = None
    row.endpoint = None
    row.status = "ready"
    row.error_message = None
    row.credentials = credentials
    row.updated_at = datetime.now(UTC)
    return row


def _make_service() -> tuple[RepositoryService, AsyncMock]:
    session = AsyncMock()
    svc = RepositoryService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ─── _slugify_creds ───────────────────────────────────────────────────────


class TestSlugifyCreds:
    def test_replaces_sensitive_value(self):
        result = _slugify_creds("error: token=mysecret failed", ["mysecret"])
        assert "mysecret" not in result
        assert "***" in result

    def test_strips_url_credentials(self):
        result = _slugify_creds("https://user:password@github.com/org/repo", [])
        assert "password" not in result
        assert "https://***@github.com/org/repo" in result

    def test_no_sensitive_data(self):
        result = _slugify_creds("repository not found", [])
        assert result == "repository not found"

    def test_empty_sensitive_value_skipped(self):
        result = _slugify_creds("error message", [""])
        assert result == "error message"

    def test_multiple_sensitive_values(self):
        result = _slugify_creds("token=abc key=xyz", ["abc", "xyz"])
        assert "abc" not in result
        assert "xyz" not in result


# ─── test_repository (module-level) ───────────────────────────────────────


class TestTestRepository:
    @pytest.mark.asyncio
    async def test_delegates_to_s3_for_s3_provider(self):
        dto = TestRepositoryDto(provider_type="s3", bucket_name=None)
        result = await check_repository(dto)
        # Missing bucket_name → INVALID_PATH
        assert result.ok is False
        assert result.code == "INVALID_PATH"

    @pytest.mark.asyncio
    async def test_git_empty_url_returns_error(self):
        dto = TestRepositoryDto(provider_type="git", remote_url="")
        result = await check_repository(dto)
        assert result.ok is False
        assert result.code == "INVALID_URL"

    @pytest.mark.asyncio
    async def test_git_bad_url_scheme_returns_error(self):
        dto = TestRepositoryDto(provider_type="git", remote_url="ftp://example.com/repo")
        result = await check_repository(dto)
        assert result.ok is False
        assert result.code == "INVALID_URL"

    @pytest.mark.asyncio
    async def test_git_ssh_url_with_token_auth_returns_error(self):
        dto = TestRepositoryDto(
            provider_type="git",
            remote_url="git@github.com:org/repo.git",
            auth_type="token",
        )
        result = await check_repository(dto)
        assert result.ok is False
        assert result.code == "INVALID_URL"

    @pytest.mark.asyncio
    async def test_git_https_url_with_ssh_auth_returns_error(self):
        dto = TestRepositoryDto(
            provider_type="git",
            remote_url="https://github.com/org/repo",
            auth_type="ssh",
        )
        result = await check_repository(dto)
        assert result.ok is False
        assert result.code == "INVALID_URL"

    @pytest.mark.asyncio
    async def test_git_success_via_mock(self):
        dto = TestRepositoryDto(
            provider_type="git",
            remote_url="https://github.com/org/repo",
            auth_type="none",
        )
        stdout = "ref: refs/heads/main\tHEAD\nrefs/heads/main"
        with patch(
            "telaios.modules.repositories.service._run_git",
            return_value=(0, stdout, ""),
        ):
            result = await check_repository(dto)

        assert result.ok is True
        assert result.code == "OK"
        assert result.default_branch == "main"

    @pytest.mark.asyncio
    async def test_git_timeout_returns_timeout_code(self):
        dto = TestRepositoryDto(
            provider_type="git",
            remote_url="https://github.com/org/repo",
        )
        with patch(
            "telaios.modules.repositories.service._run_git",
            side_effect=TimeoutError(),
        ):
            result = await check_repository(dto)

        assert result.ok is False
        assert result.code == "TIMEOUT"

    @pytest.mark.asyncio
    async def test_git_auth_failed_keyword(self):
        dto = TestRepositoryDto(
            provider_type="git",
            remote_url="https://github.com/org/repo",
        )
        with patch(
            "telaios.modules.repositories.service._run_git",
            return_value=(1, "", "authentication failed"),
        ):
            result = await check_repository(dto)

        assert result.ok is False
        assert result.code == "AUTH_FAILED"

    @pytest.mark.asyncio
    async def test_s3_missing_credentials_returns_error(self):
        dto = TestRepositoryDto(
            provider_type="s3",
            bucket_name="my-bucket",
            credentials=None,
        )
        result = await check_repository(dto)
        assert result.ok is False
        assert result.code == "AUTH_FAILED"

    @pytest.mark.asyncio
    async def test_s3_invalid_json_credentials(self):
        dto = TestRepositoryDto(
            provider_type="s3",
            bucket_name="my-bucket",
            credentials="not-json",
        )
        result = await check_repository(dto)
        assert result.ok is False
        assert result.code == "AUTH_FAILED"


# ─── RepositoryService ────────────────────────────────────────────────────


class TestRepositoryServiceList:
    @pytest.mark.asyncio
    async def test_list_returns_sanitized(self):
        svc, repo = _make_service()
        pid = uuid.uuid4()
        rows = [_make_repo_row(project_id=pid), _make_repo_row(project_id=pid)]
        repo.list_by_project.return_value = rows

        with patch("telaios.utils.crypto.decrypt", return_value=None):
            result = await svc.list_repositories(pid)

        assert len(result) == 2
        for r in result:
            assert r.has_credentials is False


class TestRepositoryServiceCreate:
    @pytest.mark.asyncio
    async def test_create_without_credentials(self):
        svc, repo = _make_service()
        pid = uuid.uuid4()
        row = _make_repo_row(project_id=pid)
        repo.create.return_value = row

        with patch("telaios.utils.crypto.decrypt", return_value=None):
            result = await svc.create_repository(pid, RepositoryCreate(name="repo"))

        repo.create.assert_awaited_once()
        assert result.name == "my-repo"

    @pytest.mark.asyncio
    async def test_create_encrypts_credentials(self):
        svc, repo = _make_service()
        pid = uuid.uuid4()
        row = _make_repo_row(project_id=pid, credentials="enc")
        repo.create.return_value = row

        with (
            patch("telaios.modules.repositories.service.encrypt", return_value="enc") as mock_enc,
            patch("telaios.utils.crypto.decrypt", return_value="plain"),
        ):
            await svc.create_repository(pid, RepositoryCreate(name="r", credentials="plain-token"))

        mock_enc.assert_called_once_with("plain-token")


class TestRepositoryServiceGet:
    @pytest.mark.asyncio
    async def test_get_found(self):
        svc, repo = _make_service()
        uid, pid = uuid.uuid4(), uuid.uuid4()
        row = _make_repo_row(uid=uid, project_id=pid)
        repo.find.return_value = row

        with patch("telaios.utils.crypto.decrypt", return_value=None):
            result = await svc.get_repository(uid, pid)

        assert result.id == uid

    @pytest.mark.asyncio
    async def test_get_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get_repository(uuid.uuid4(), uuid.uuid4())


class TestRepositoryServicePatch:
    @pytest.mark.asyncio
    async def test_patch_name(self):
        svc, repo = _make_service()
        uid, pid = uuid.uuid4(), uuid.uuid4()
        before = _make_repo_row(uid=uid, project_id=pid, name="old")
        after = _make_repo_row(uid=uid, project_id=pid, name="new")
        repo.find.return_value = before
        repo.save.return_value = after

        with patch("telaios.utils.crypto.decrypt", return_value=None):
            result = await svc.patch_repository(uid, pid, RepositoryPatch(name="new"))

        assert result.name == "new"

    @pytest.mark.asyncio
    async def test_patch_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch_repository(uuid.uuid4(), uuid.uuid4(), RepositoryPatch(name="x"))

    @pytest.mark.asyncio
    async def test_patch_encrypts_credentials(self):
        svc, repo = _make_service()
        uid, pid = uuid.uuid4(), uuid.uuid4()
        row = _make_repo_row(uid=uid, project_id=pid)
        repo.find.return_value = row
        repo.save.return_value = row

        with (
            patch("telaios.modules.repositories.service.encrypt", return_value="enc") as mock_enc,
            patch("telaios.utils.crypto.decrypt", return_value=None),
        ):
            await svc.patch_repository(uid, pid, RepositoryPatch(credentials="new-token"))

        mock_enc.assert_called_once_with("new-token")


class TestRepositoryServiceDelete:
    @pytest.mark.asyncio
    async def test_delete_calls_soft_delete(self):
        svc, repo = _make_service()
        uid, pid = uuid.uuid4(), uuid.uuid4()
        row = _make_repo_row(uid=uid, project_id=pid)
        repo.find.return_value = row

        await svc.delete_repository(uid, pid)
        repo.soft_delete.assert_awaited_once_with(row)

    @pytest.mark.asyncio
    async def test_delete_not_found_raises(self):
        svc, repo = _make_service()
        repo.find.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete_repository(uuid.uuid4(), uuid.uuid4())
