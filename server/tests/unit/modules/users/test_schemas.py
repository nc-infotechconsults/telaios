"""tests/unit/modules/users/test_schemas.py

Unit tests for user and auth Pydantic schemas.

Ported from:
  - ``data-api/src/__tests__/unit/schemas/user.schema.test.ts``
  - ``data-api/src/__tests__/unit/schemas/auth.schema.test.ts``
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from telaios.modules.users.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserRead,
    UserUpdate,
)

# ─── RegisterRequest ──────────────────────────────────────────────────────


class TestRegisterRequest:
    def test_valid_payload(self):
        r = RegisterRequest(email="user@example.com", password="secret123", display_name="Alice")
        assert r.email == "user@example.com"
        assert r.display_name == "Alice"

    def test_email_domain_normalised(self):
        """Pydantic EmailStr lowercases the domain portion only.

        The local part (before @) is NOT normalised by the schema —
        lowercasing happens in UserService.register() at the service layer.
        """
        r = RegisterRequest(email="User@EXAMPLE.COM", password="secret123", display_name="Alice")
        # Domain must be lowercase; local part may vary per RFC 5321
        assert r.email.endswith("@example.com")

    def test_password_too_short_raises(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="u@ex.com", password="short", display_name="A")

    def test_empty_display_name_raises(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="u@ex.com", password="secret123", display_name="")

    def test_invalid_email_raises(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="not-an-email", password="secret123", display_name="A")


# ─── LoginRequest ─────────────────────────────────────────────────────────


class TestLoginRequest:
    def test_valid_payload(self):
        r = LoginRequest(email="user@example.com", password="pw")
        assert r.email == "user@example.com"

    def test_empty_password_raises(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="u@ex.com", password="")

    def test_invalid_email_raises(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="notanemail", password="pw")


# ─── UserRead ─────────────────────────────────────────────────────────────


class TestUserRead:
    def _make(self, **kwargs) -> UserRead:
        defaults = dict(
            id=uuid.uuid4(),
            email="u@ex.com",
            display_name="User",
            system_role="member",
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        defaults.update(kwargs)
        return UserRead(**defaults)

    def test_valid_member(self):
        u = self._make()
        assert u.system_role == "member"
        assert u.is_active is True

    def test_valid_admin(self):
        u = self._make(system_role="admin")
        assert u.system_role == "admin"

    def test_invalid_role_raises(self):
        with pytest.raises(ValidationError):
            self._make(system_role="superuser")

    def test_from_attributes_roundtrip(self):
        """model_validate works with an object that has matching attributes."""

        class FakeRow:
            id = uuid.uuid4()
            email = "row@ex.com"
            display_name = "Row User"
            system_role = "admin"
            is_active = True
            created_at = datetime.now(UTC)
            updated_at = datetime.now(UTC)

        u = UserRead.model_validate(FakeRow())
        assert u.email == "row@ex.com"
        assert u.system_role == "admin"


# ─── UserUpdate ───────────────────────────────────────────────────────────


class TestUserUpdate:
    def test_all_none_is_valid(self):
        u = UserUpdate()
        assert u.display_name is None
        assert u.system_role is None
        assert u.is_active is None

    def test_partial_update(self):
        u = UserUpdate(display_name="New Name")
        assert u.display_name == "New Name"
        assert u.system_role is None

    def test_empty_display_name_raises(self):
        with pytest.raises(ValidationError):
            UserUpdate(display_name="")

    def test_invalid_system_role_raises(self):
        with pytest.raises(ValidationError):
            UserUpdate(system_role="god")

    def test_model_dump_excludes_none(self):
        u = UserUpdate(display_name="Name")
        dumped = u.model_dump(exclude_none=True)
        assert "display_name" in dumped
        assert "system_role" not in dumped
        assert "is_active" not in dumped


# ─── TokenResponse ────────────────────────────────────────────────────────


class TestTokenResponse:
    def test_valid_token_response(self):
        user = UserRead(
            id=uuid.uuid4(),
            email="u@ex.com",
            display_name="U",
            system_role="member",
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        tr = TokenResponse(token="jwt.token.here", user=user)
        assert tr.token == "jwt.token.here"
        assert tr.user.email == "u@ex.com"

    def test_missing_token_raises(self):
        user = UserRead(
            id=uuid.uuid4(),
            email="u@ex.com",
            display_name="U",
            system_role="member",
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        with pytest.raises(ValidationError):
            TokenResponse(user=user)  # type: ignore[call-arg]
