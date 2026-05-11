"""tests/unit/modules/users/test_service.py

Unit tests for :class:`telaios.modules.users.service.UserService`.

Ported from:
  - ``data-api/src/__tests__/unit/services/user.service.test.ts``
  - ``data-api/src/__tests__/unit/services/auth.service.test.ts``

Strategy
--------
- Replace ``service._repo`` with an :class:`~unittest.mock.AsyncMock` after
  construction.  This avoids needing a real DB session.
- Mock return values are plain Python objects (MagicMock with attributes set),
  not SQLAlchemy ORM instances, so we bypass model_validate by patching it
  where needed or by constructing valid UserRead instances directly.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.users.schemas import (
    LoginRequest,
    RegisterRequest,
    UserRead,
    UserUpdate,
)
from telaios.modules.users.service import UserService
from telaios.utils.errors import ConflictError, NotFoundError, UnauthorizedError

# ─── Helpers ──────────────────────────────────────────────────────────────


def _make_user_row(
    uid: uuid.UUID | None = None,
    email: str = "u@ex.com",
    display_name: str = "User",
    system_role: str = "member",
    is_active: bool = True,
    password_hash: str = "$2b$12$fakehashfakehashfakehash.fakehashfakehashhash",
) -> MagicMock:
    row = MagicMock()
    row.id = uid or uuid.uuid4()
    row.email = email
    row.display_name = display_name
    row.system_role = system_role
    row.is_active = is_active
    row.password_hash = password_hash
    row.created_at = datetime.now(UTC)
    row.updated_at = datetime.now(UTC)
    row.deleted_at = None
    return row


def _make_service() -> tuple[UserService, AsyncMock]:
    """Return (service, repo_mock) — repo is pre-wired as AsyncMock."""
    session = AsyncMock()
    svc = UserService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ─── register ─────────────────────────────────────────────────────────────


class TestRegister:
    @pytest.mark.asyncio
    async def test_first_user_becomes_admin(self):
        svc, repo = _make_service()
        repo.find_by_email.return_value = None
        repo.count.return_value = 0
        row = _make_user_row(system_role="admin")
        repo.create.return_value = row

        with patch("telaios.modules.users.service.issue_token", return_value="tok"):
            result = await svc.register(
                RegisterRequest(email="a@ex.com", password="secret123", display_name="A")
            )

        repo.create.assert_awaited_once()
        _, kwargs = repo.create.call_args
        assert kwargs["system_role"] == "admin"
        assert result.token == "tok"

    @pytest.mark.asyncio
    async def test_subsequent_user_is_member(self):
        svc, repo = _make_service()
        repo.find_by_email.return_value = None
        repo.count.return_value = 5
        row = _make_user_row(system_role="member")
        repo.create.return_value = row

        with patch("telaios.modules.users.service.issue_token", return_value="tok"):
            await svc.register(
                RegisterRequest(email="b@ex.com", password="secret123", display_name="B")
            )

        _, kwargs = repo.create.call_args
        assert kwargs["system_role"] == "member"

    @pytest.mark.asyncio
    async def test_duplicate_email_raises_conflict(self):
        svc, repo = _make_service()
        repo.find_by_email.return_value = _make_user_row()

        with pytest.raises(ConflictError):
            await svc.register(
                RegisterRequest(email="dup@ex.com", password="secret123", display_name="D")
            )

    @pytest.mark.asyncio
    async def test_email_is_lowercased_before_lookup(self):
        svc, repo = _make_service()
        repo.find_by_email.return_value = None
        repo.count.return_value = 1
        repo.create.return_value = _make_user_row(email="upper@ex.com")

        with patch("telaios.modules.users.service.issue_token", return_value="t"):
            await svc.register(
                RegisterRequest(email="UPPER@EX.COM", password="secret123", display_name="U")
            )

        repo.find_by_email.assert_awaited_once_with("upper@ex.com")


# ─── login ────────────────────────────────────────────────────────────────


class TestLogin:
    @pytest.mark.asyncio
    async def test_valid_credentials_return_token(self):
        svc, repo = _make_service()
        row = _make_user_row()
        repo.find_by_email.return_value = row

        with (
            patch("telaios.modules.users.service.verify_password", return_value=True),
            patch("telaios.modules.users.service.issue_token", return_value="jwt"),
        ):
            result = await svc.login(LoginRequest(email="u@ex.com", password="pw"))

        assert result.token == "jwt"

    @pytest.mark.asyncio
    async def test_unknown_email_raises_401(self):
        svc, repo = _make_service()
        repo.find_by_email.return_value = None

        with pytest.raises(UnauthorizedError):
            await svc.login(LoginRequest(email="x@ex.com", password="pw"))

    @pytest.mark.asyncio
    async def test_inactive_user_raises_401(self):
        svc, repo = _make_service()
        repo.find_by_email.return_value = _make_user_row(is_active=False)

        with pytest.raises(UnauthorizedError):
            await svc.login(LoginRequest(email="u@ex.com", password="pw"))

    @pytest.mark.asyncio
    async def test_wrong_password_raises_401(self):
        svc, repo = _make_service()
        repo.find_by_email.return_value = _make_user_row()

        with (
            patch("telaios.modules.users.service.verify_password", return_value=False),
            pytest.raises(UnauthorizedError),
        ):
            await svc.login(LoginRequest(email="u@ex.com", password="wrong"))


# ─── list_users / get_user ────────────────────────────────────────────────


class TestListAndGet:
    @pytest.mark.asyncio
    async def test_list_users_returns_all(self):
        svc, repo = _make_service()
        rows = [_make_user_row(), _make_user_row()]
        repo.find_all.return_value = rows

        result = await svc.list_users()
        assert len(result) == 2
        assert all(isinstance(u, UserRead) for u in result)

    @pytest.mark.asyncio
    async def test_get_user_found(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        row = _make_user_row(uid=uid)
        repo.find_by_id.return_value = row

        result = await svc.get_user(uid)
        assert result.id == uid

    @pytest.mark.asyncio
    async def test_get_user_not_found_raises(self):
        svc, repo = _make_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.get_user(uuid.uuid4())


# ─── patch_user ───────────────────────────────────────────────────────────


class TestPatchUser:
    @pytest.mark.asyncio
    async def test_patch_applies_updates(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        before = _make_user_row(uid=uid)
        after = _make_user_row(uid=uid, display_name="Updated")
        repo.find_by_id.return_value = before
        repo.update.return_value = after

        result = await svc.patch_user(uid, UserUpdate(display_name="Updated"))
        repo.update.assert_awaited_once_with(before, display_name="Updated")
        assert result.display_name == "Updated"

    @pytest.mark.asyncio
    async def test_patch_no_changes_skips_update(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        row = _make_user_row(uid=uid)
        repo.find_by_id.return_value = row

        await svc.patch_user(uid, UserUpdate())
        repo.update.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_patch_not_found_raises(self):
        svc, repo = _make_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.patch_user(uuid.uuid4(), UserUpdate(display_name="X"))


# ─── delete_user ──────────────────────────────────────────────────────────


class TestDeleteUser:
    @pytest.mark.asyncio
    async def test_delete_calls_soft_delete(self):
        svc, repo = _make_service()
        uid = uuid.uuid4()
        row = _make_user_row(uid=uid)
        repo.find_by_id.return_value = row

        await svc.delete_user(uid)
        repo.soft_delete.assert_awaited_once_with(row)

    @pytest.mark.asyncio
    async def test_delete_not_found_raises(self):
        svc, repo = _make_service()
        repo.find_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await svc.delete_user(uuid.uuid4())
