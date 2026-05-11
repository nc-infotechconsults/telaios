"""Health-check endpoints.

/health   — liveness probe (always 200 if process is up)
/ready    — readiness probe (checks DB + Redis)
/version  — returns the application version string
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.session import get_sessionmaker
from telaios.infra.redis import get_redis

logger = logging.getLogger(__name__)

health_router = APIRouter(tags=["health"])


@health_router.get("/health")
async def liveness() -> dict[str, str]:
    """Liveness probe — always 200 while the process is alive."""
    return {"status": "ok"}


@health_router.get("/ready")
async def readiness() -> JSONResponse:
    """Readiness probe — checks DB + Redis connectivity."""
    checks: dict[str, str] = {}
    ok = True

    # ── Database ──────────────────────────────────────────────────────────────
    try:
        async with get_sessionmaker()() as session:
            sess: AsyncSession = session
            await sess.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:
        logger.warning("readiness: DB check failed: %s", exc)
        checks["db"] = "error"
        ok = False

    # ── Redis ─────────────────────────────────────────────────────────────────
    try:
        redis = get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        logger.warning("readiness: Redis check failed: %s", exc)
        checks["redis"] = "error"
        ok = False

    status_code = 200 if ok else 503
    return JSONResponse(
        {"status": "ok" if ok else "error", "checks": checks}, status_code=status_code
    )


@health_router.get("/version")
async def version() -> dict[str, str]:
    """Return the running application version."""
    return {"version": "0.1.0"}
