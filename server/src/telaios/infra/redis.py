"""Lazy async Redis client.

Provides a process-wide singleton ``redis.asyncio.Redis`` built from
``settings.REDIS_URL``. The client is created on first access and closed via
:func:`close_redis` from the FastAPI lifespan handler.
"""

from __future__ import annotations

import redis.asyncio as aioredis

from telaios.config.settings import get_settings

__all__ = ["close_redis", "get_redis"]

_client: aioredis.Redis[str] | None = None


def get_redis() -> aioredis.Redis[str]:
    """Return the process-wide async Redis client (lazy)."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Close the singleton client if it was created."""
    global _client
    if _client is None:
        return
    await _client.aclose()  # type: ignore[attr-defined]
    _client = None
