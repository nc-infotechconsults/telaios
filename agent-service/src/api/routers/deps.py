"""
api/routers/deps.py
-------------------
Shared FastAPI dependencies for API routers.

FastAPI dependency helpers.

Usage::

    from api.routers.deps import ApiKeyDep

    @router.get("/protected")
    async def protected(_auth: ApiKeyDep):
        ...
"""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from infra.settings import config

_bearer = HTTPBearer(auto_error=False)


def require_api_key(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(_bearer)],
) -> None:
    """
    Validate the Bearer token against DATA_API_KEY.

    Uses hmac.compare_digest to prevent timing attacks.
    Raises 401 if the key is missing or invalid.
    """
    if not config.DATA_API_KEY:
        raise HTTPException(status_code=503, detail="Service not configured: DATA_API_KEY missing")

    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    provided = credentials.credentials.encode()
    expected = config.DATA_API_KEY.encode()
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid API key")


ApiKeyDep = Annotated[None, Depends(require_api_key)]
