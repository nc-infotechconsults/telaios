"""FastAPI authentication dependencies.

Provides:
  - :class:`Principal`        — lightweight authenticated identity
  - :func:`current_principal` — Bearer-token-based auth dep
  - :func:`require_admin`     — system-role guard dep
  - :func:`set_user_loader`   — hook that the ``users`` module installs in Phase 4
                                 to look up the full ``User`` from the JWT subject

Phase 1 scope: only JWT decode + INTERNAL_API_KEY bypass works. Without a
registered user-loader, valid JWTs resolve to a :class:`Principal` carrying the
claim values (``sub``, ``email``, ``system_role``) without DB validation.
The ``users`` module wires the loader in Phase 4 so we can also enforce
``is_active`` and load fresh role info from the DB.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from telaios.auth.internal_api_key import is_internal_api_key
from telaios.auth.jwt import verify_token
from telaios.utils.errors import ForbiddenError, UnauthorizedError

# ─── Identity ──────────────────────────────────────────────────────────────

SERVICE_PRINCIPAL_ID = "service"


@dataclass(frozen=True)
class Principal:
    """Authenticated caller identity."""

    id: str
    email: str
    system_role: str
    is_service: bool = False


# ─── User loader hook ──────────────────────────────────────────────────────

UserLoader = Callable[[str], Awaitable[Principal | None]]
_user_loader: UserLoader | None = None


def set_user_loader(loader: UserLoader | None) -> None:
    """Register a coroutine that loads a Principal from a user-id (JWT sub).

    Installed by the ``users`` module in Phase 4. If ``None``, JWT-decoded
    claims are returned as-is without DB validation (Phase 1 fallback).
    """
    global _user_loader
    _user_loader = loader


# ─── Helpers ───────────────────────────────────────────────────────────────


def _extract_bearer(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise UnauthorizedError("Authentication required")
    token = auth[7:].strip()
    if not token:
        raise UnauthorizedError("Authentication required")
    return token


def _service_principal() -> Principal:
    return Principal(
        id=SERVICE_PRINCIPAL_ID,
        email="service@internal",
        system_role="admin",
        is_service=True,
    )


# ─── Dependencies ──────────────────────────────────────────────────────────


async def current_principal(request: Request) -> Principal:
    """Resolve the request's Bearer token to a :class:`Principal`.

    Resolution order:
      1. INTERNAL_API_KEY exact match → service principal.
      2. JWT verify → user-loader (if registered) → Principal.
      3. JWT verify → claims-only Principal (Phase 1 fallback).
    """
    token = _extract_bearer(request)

    if is_internal_api_key(token):
        return _service_principal()

    claims = verify_token(token)

    if _user_loader is not None:
        loaded = await _user_loader(claims.sub)
        if loaded is None:
            raise UnauthorizedError("Invalid or inactive account")
        return loaded

    return Principal(
        id=claims.sub,
        email=claims.email,
        system_role=claims.system_role,
    )


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]


def require_role(*roles: str) -> Callable[[Principal], Principal]:
    """Build a dependency that enforces ``system_role`` membership."""
    allowed = set(roles)

    def _checker(principal: CurrentPrincipal) -> Principal:
        if principal.system_role not in allowed:
            raise ForbiddenError("Insufficient permissions")
        return principal

    return _checker


require_admin = require_role("admin")


__all__ = [
    "SERVICE_PRINCIPAL_ID",
    "CurrentPrincipal",
    "Principal",
    "UserLoader",
    "current_principal",
    "require_admin",
    "require_role",
    "set_user_loader",
]
