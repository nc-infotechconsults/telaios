"""tests/unit/auth/test_require_system_role.py

Unit tests for :func:`telaios.auth.dependencies.require_role` and
:func:`~telaios.auth.dependencies.require_admin`.

Ported from ``data-api/src/__tests__/unit/middleware/requireSystemRole.test.ts``.

These are synchronous checks — no DB or JWT involved.
"""

from __future__ import annotations

import pytest

from telaios.auth.dependencies import Principal, require_admin, require_role
from telaios.utils.errors import ForbiddenError

# ─── Helpers ──────────────────────────────────────────────────────────────


def _principal(system_role: str = "member") -> Principal:
    return Principal(id="user-1", email="u@ex.com", system_role=system_role)


# ─── require_role ─────────────────────────────────────────────────────────


class TestRequireRole:
    def test_matching_role_returns_principal(self):
        checker = require_role("admin")
        p = _principal("admin")
        result = checker(p)
        assert result is p

    def test_wrong_role_raises_forbidden(self):
        checker = require_role("admin")
        with pytest.raises(ForbiddenError):
            checker(_principal("member"))

    def test_multiple_roles_any_match(self):
        checker = require_role("admin", "editor")
        assert checker(_principal("admin")).system_role == "admin"
        assert checker(_principal("editor")).system_role == "editor"

    def test_multiple_roles_no_match_raises(self):
        checker = require_role("admin", "editor")
        with pytest.raises(ForbiddenError):
            checker(_principal("member"))

    def test_empty_role_set_always_raises(self):
        checker = require_role()
        with pytest.raises(ForbiddenError):
            checker(_principal("admin"))


# ─── require_admin ────────────────────────────────────────────────────────


class TestRequireAdmin:
    def test_admin_passes(self):
        result = require_admin(_principal("admin"))
        assert result.system_role == "admin"

    def test_member_raises_forbidden(self):
        with pytest.raises(ForbiddenError):
            require_admin(_principal("member"))

    def test_error_message_mentions_permissions(self):
        with pytest.raises(ForbiddenError, match=r"[Ii]nsufficient"):
            require_admin(_principal("member"))
