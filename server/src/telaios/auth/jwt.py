"""JWT signing and verification.

Wire-compatible with legacy ``data-api`` JWTs:
  - HS256
  - 7-day expiry (configurable via ``JWT_EXPIRES_IN_SECONDS``)
  - Payload: ``{sub, email, system_role, iat, exp}``

Tokens issued by the legacy TS service remain valid as long as ``JWT_SECRET``
is unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt as pyjwt

from telaios.config.settings import settings
from telaios.utils.errors import UnauthorizedError


@dataclass(frozen=True)
class TokenClaims:
    """Decoded JWT claims."""

    sub: str
    email: str
    system_role: str
    iat: int
    exp: int


def issue_token(
    *,
    user_id: str,
    email: str,
    system_role: str,
    expires_in: int | None = None,
) -> str:
    """Sign a JWT for the given user."""
    now = datetime.now(UTC)
    ttl = expires_in if expires_in is not None else settings.JWT_EXPIRES_IN_SECONDS
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "system_role": system_role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    return pyjwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str) -> TokenClaims:
    """Decode and verify a JWT.

    Raises :class:`UnauthorizedError` for any failure (expired, malformed, bad
    signature, missing claims).
    """
    try:
        payload: dict[str, Any] = pyjwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except pyjwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Token expired") from exc
    except pyjwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid token") from exc

    try:
        return TokenClaims(
            sub=str(payload["sub"]),
            email=str(payload["email"]),
            system_role=str(payload["system_role"]),
            iat=int(payload["iat"]),
            exp=int(payload["exp"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise UnauthorizedError("Malformed token claims") from exc


__all__ = ["TokenClaims", "issue_token", "verify_token"]
