"""
api/middleware/authenticate.py
------------------------------
Bearer-token authentication middleware.

Validates the ``Authorization: Bearer <token>`` header on every request
using a constant-time comparison to prevent timing attacks.

Excluded paths (no auth required):
- ``/health``
"""

from __future__ import annotations

import hmac

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from telaios.infra.settings import config

_EXCLUDED_PREFIXES = ("/health",)


class AuthenticateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if any(request.url.path.startswith(p) for p in _EXCLUDED_PREFIXES):
            return await call_next(request)

        if not config.DATA_API_KEY:
            return JSONResponse(
                status_code=503,
                content={"error": "Service not configured: DATA_API_KEY missing"},
            )

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"error": "Authentication required"},
            )

        provided = auth_header.removeprefix("Bearer ").encode()
        expected = config.DATA_API_KEY.encode()
        if not hmac.compare_digest(provided, expected):
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid API key"},
            )

        return await call_next(request)
