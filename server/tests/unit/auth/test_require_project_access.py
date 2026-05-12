"""tests/unit/auth/test_require_project_access.py

Unit tests for :func:`telaios.auth.project_access.check_project_membership`.

Ported from
``data-api/src/__tests__/unit/middleware/requireProjectAccess.test.ts``.

Strategy
--------
- Use :class:`unittest.mock.AsyncMock` for the SQLAlchemy session's
  ``.execute()`` call — no DB required.
- Verify role-hierarchy enforcement (viewer < editor < owner) and admin bypass.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.auth.dependencies import Principal
from telaios.auth.project_access import check_environment_project_access, check_project_membership
from telaios.utils.errors import ForbiddenError

# ─── Helpers ──────────────────────────────────────────────────────────────


def _principal(system_role: str = "member", uid: str | None = None) -> Principal:
    return Principal(
        id=uid or str(uuid.uuid4()),
        email="u@ex.com",
        system_role=system_role,
    )


def _mock_session(membership_role: str | None) -> AsyncMock:
    """Return an AsyncSession mock whose execute() result yields ``membership_role``."""
    session = AsyncMock()
    if membership_role is not None:
        member = MagicMock()
        member.role = membership_role
        scalar_result = MagicMock()
        scalar_result.scalar_one_or_none.return_value = member
    else:
        scalar_result = MagicMock()
        scalar_result.scalar_one_or_none.return_value = None
    session.execute.return_value = scalar_result
    return session


def _mock_env_session(project_id: uuid.UUID | None, membership_role: str | None) -> AsyncMock:
    """Return a session mock for env lookup followed by membership lookup."""
    session = AsyncMock()

    env_result = MagicMock()
    env_result.scalar_one_or_none.return_value = project_id

    if membership_role is not None:
        member = MagicMock()
        member.role = membership_role
        member_result = MagicMock()
        member_result.scalar_one_or_none.return_value = member
    else:
        member_result = MagicMock()
        member_result.scalar_one_or_none.return_value = None

    session.execute.side_effect = [env_result, member_result]
    return session


# ─── Tests: admin bypass ──────────────────────────────────────────────────


class TestAdminBypass:
    @pytest.mark.asyncio
    async def test_admin_bypasses_membership_check(self):
        """Admin principals never hit the DB."""
        p = _principal(system_role="admin")
        session = AsyncMock()
        # Should not raise, and should not query DB
        await check_project_membership(uuid.uuid4(), p, session, min_role="owner")
        session.execute.assert_not_called()


# ─── Tests: non-member ────────────────────────────────────────────────────


class TestNonMember:
    @pytest.mark.asyncio
    async def test_non_member_raises_forbidden(self):
        p = _principal()
        session = _mock_session(membership_role=None)
        with pytest.raises(ForbiddenError, match=r"[Mm]ember"):
            await check_project_membership(uuid.uuid4(), p, session)


# ─── Tests: role hierarchy ────────────────────────────────────────────────


class TestRoleHierarchy:
    @pytest.mark.asyncio
    async def test_viewer_satisfies_viewer(self):
        p = _principal()
        await check_project_membership(uuid.uuid4(), p, _mock_session("viewer"), min_role="viewer")

    @pytest.mark.asyncio
    async def test_editor_satisfies_viewer(self):
        p = _principal()
        await check_project_membership(uuid.uuid4(), p, _mock_session("editor"), min_role="viewer")

    @pytest.mark.asyncio
    async def test_owner_satisfies_editor(self):
        p = _principal()
        await check_project_membership(uuid.uuid4(), p, _mock_session("owner"), min_role="editor")

    @pytest.mark.asyncio
    async def test_viewer_insufficient_for_editor(self):
        p = _principal()
        with pytest.raises(ForbiddenError):
            await check_project_membership(
                uuid.uuid4(), p, _mock_session("viewer"), min_role="editor"
            )

    @pytest.mark.asyncio
    async def test_editor_insufficient_for_owner(self):
        p = _principal()
        with pytest.raises(ForbiddenError):
            await check_project_membership(
                uuid.uuid4(), p, _mock_session("editor"), min_role="owner"
            )

    @pytest.mark.asyncio
    async def test_viewer_insufficient_for_owner(self):
        p = _principal()
        with pytest.raises(ForbiddenError):
            await check_project_membership(
                uuid.uuid4(), p, _mock_session("viewer"), min_role="owner"
            )

    @pytest.mark.asyncio
    async def test_owner_satisfies_owner(self):
        p = _principal()
        await check_project_membership(uuid.uuid4(), p, _mock_session("owner"), min_role="owner")


class TestEnvironmentProjectAccess:
    @pytest.mark.asyncio
    async def test_resolves_environment_project_and_checks_membership(self):
        project_id = uuid.uuid4()
        p = _principal()
        session = _mock_env_session(project_id, "editor")

        resolved_project_id = await check_environment_project_access(
            uuid.uuid4(), p, session, min_role="viewer"
        )

        assert resolved_project_id == project_id
        assert session.execute.await_count == 2

    @pytest.mark.asyncio
    async def test_forbids_non_member(self):
        p = _principal()
        session = _mock_env_session(uuid.uuid4(), None)

        with pytest.raises(ForbiddenError):
            await check_environment_project_access(uuid.uuid4(), p, session)

    @pytest.mark.asyncio
    async def test_admin_bypasses_membership_after_environment_resolution(self):
        project_id = uuid.uuid4()
        p = _principal(system_role="admin")
        session = _mock_env_session(project_id, None)

        resolved_project_id = await check_environment_project_access(
            uuid.uuid4(), p, session, min_role="owner"
        )

        assert resolved_project_id == project_id
        assert session.execute.await_count == 1
