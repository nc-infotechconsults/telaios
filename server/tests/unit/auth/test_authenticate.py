"""tests/unit/auth/test_authenticate.py

Unit tests for :func:`telaios.auth.dependencies.current_principal`.

Ported from ``data-api/src/__tests__/unit/middleware/authenticate.test.ts``.

Strategy
--------
- Construct a minimal mock :class:`~fastapi.Request` with a ``headers``
  dict (no real ASGI scope needed).
- Patch :func:`telaios.auth.dependencies.verify_token` to control what
  the JWT layer returns without touching PyJWT / settings.
- Reset the user-loader hook before/after every test so tests are isolated.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.auth.dependencies import (
    SERVICE_PRINCIPAL_ID,
    Principal,
    current_principal,
    set_user_loader,
)
from telaios.auth.jwt import TokenClaims
from telaios.utils.errors import UnauthorizedError

# ─── Helpers ──────────────────────────────────────────────────────────────


def _make_request(authorization: str = "") -> MagicMock:
    """Return a mock Request with a headers dict."""
    req = MagicMock()
    req.headers = {"authorization": authorization}
    return req


def _make_claims(
    sub: str = "user-123",
    email: str = "user@example.com",
    system_role: str = "member",
) -> TokenClaims:
    return TokenClaims(sub=sub, email=email, system_role=system_role, iat=0, exp=9999999999)


# ─── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_user_loader():
    """Ensure the user-loader is cleared before and after each test."""
    set_user_loader(None)
    yield
    set_user_loader(None)


# ─── Tests: missing / malformed header ────────────────────────────────────


class TestMissingOrMalformedHeader:
    @pytest.mark.asyncio
    async def test_no_authorization_header_raises_401(self):
        req = _make_request(authorization="")
        with pytest.raises(UnauthorizedError):
            await current_principal(req)

    @pytest.mark.asyncio
    async def test_non_bearer_scheme_raises_401(self):
        req = _make_request(authorization="Basic dXNlcjpwYXNz")
        with pytest.raises(UnauthorizedError):
            await current_principal(req)

    @pytest.mark.asyncio
    async def test_bearer_with_empty_token_raises_401(self):
        req = _make_request(authorization="Bearer ")
        with pytest.raises(UnauthorizedError):
            await current_principal(req)


# ─── Tests: internal API key ──────────────────────────────────────────────


class TestInternalApiKey:
    @pytest.mark.asyncio
    async def test_valid_internal_key_returns_service_principal(self):
        req = _make_request(authorization="Bearer my-secret-key")
        with patch("telaios.auth.dependencies.is_internal_api_key", return_value=True):
            principal = await current_principal(req)
        assert principal.id == SERVICE_PRINCIPAL_ID
        assert principal.is_service is True
        assert principal.system_role == "admin"

    @pytest.mark.asyncio
    async def test_invalid_internal_key_falls_through_to_jwt(self):
        """A non-matching key is treated as a JWT — if it's invalid, 401."""
        req = _make_request(authorization="Bearer bad-key")
        with (
            patch("telaios.auth.dependencies.is_internal_api_key", return_value=False),
            patch(
                "telaios.auth.dependencies.verify_token",
                side_effect=UnauthorizedError("Invalid token"),
            ),
            pytest.raises(UnauthorizedError),
        ):
            await current_principal(req)


# ─── Tests: JWT without user-loader (Phase 1 fallback) ────────────────────


class TestJwtNoUserLoader:
    @pytest.mark.asyncio
    async def test_valid_jwt_returns_claims_based_principal(self):
        claims = _make_claims()
        req = _make_request(authorization="Bearer valid.jwt.token")
        with (
            patch("telaios.auth.dependencies.is_internal_api_key", return_value=False),
            patch("telaios.auth.dependencies.verify_token", return_value=claims),
        ):
            principal = await current_principal(req)
        assert principal.id == claims.sub
        assert principal.email == claims.email
        assert principal.system_role == claims.system_role
        assert principal.is_service is False

    @pytest.mark.asyncio
    async def test_expired_jwt_raises_401(self):
        req = _make_request(authorization="Bearer expired.jwt")
        with (
            patch("telaios.auth.dependencies.is_internal_api_key", return_value=False),
            patch(
                "telaios.auth.dependencies.verify_token",
                side_effect=UnauthorizedError("Token expired"),
            ),
            pytest.raises(UnauthorizedError, match="expired"),
        ):
            await current_principal(req)


# ─── Tests: JWT with user-loader (Phase 4+) ───────────────────────────────


class TestJwtWithUserLoader:
    @pytest.mark.asyncio
    async def test_user_loader_called_with_sub(self):
        claims = _make_claims(sub="user-abc")
        loader = AsyncMock(
            return_value=Principal(id="user-abc", email="u@ex.com", system_role="member")
        )
        set_user_loader(loader)

        req = _make_request(authorization="Bearer valid.jwt.token")
        with (
            patch("telaios.auth.dependencies.is_internal_api_key", return_value=False),
            patch("telaios.auth.dependencies.verify_token", return_value=claims),
        ):
            principal = await current_principal(req)

        loader.assert_awaited_once_with("user-abc")
        assert principal.id == "user-abc"

    @pytest.mark.asyncio
    async def test_loader_returning_none_raises_401(self):
        claims = _make_claims()
        loader: AsyncMock = AsyncMock(return_value=None)
        set_user_loader(loader)

        req = _make_request(authorization="Bearer valid.jwt.token")
        with (
            patch("telaios.auth.dependencies.is_internal_api_key", return_value=False),
            patch("telaios.auth.dependencies.verify_token", return_value=claims),
            pytest.raises(UnauthorizedError, match="inactive"),
        ):
            await current_principal(req)

    @pytest.mark.asyncio
    async def test_loader_result_replaces_claims(self):
        """The principal from the loader is returned, not a claims-derived one."""
        claims = _make_claims(system_role="member")
        fresh = Principal(id="user-abc", email="fresh@ex.com", system_role="admin")
        loader: AsyncMock = AsyncMock(return_value=fresh)
        set_user_loader(loader)

        req = _make_request(authorization="Bearer valid.jwt.token")
        with (
            patch("telaios.auth.dependencies.is_internal_api_key", return_value=False),
            patch("telaios.auth.dependencies.verify_token", return_value=claims),
        ):
            principal = await current_principal(req)

        assert principal.system_role == "admin"
        assert principal is fresh
