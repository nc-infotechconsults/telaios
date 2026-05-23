"""Redis client — async singleton with lifecycle management.

Provides a proper class-based interface instead of module-level globals.
The module-level ``get_redis()`` / ``close_redis()`` functions remain for
backward compatibility but delegate to the class.

Usage::

    from telaios.infra.redis import RedisClient

    redis = RedisClient.from_url("redis://localhost:6379/0")
    await redis.set("key", "value")
    value = await redis.get("key")
    await redis.close()
"""

from __future__ import annotations

from typing import Any

import redis.asyncio as aioredis

from telaios.config.settings import get_settings


class RedisClient:
    """Async Redis client with lazy connection and explicit lifecycle."""

    def __init__(self, url: str, *, decode_responses: bool = True) -> None:
        self._url = url
        self._decode_responses = decode_responses
        self._client: aioredis.Redis[str] | None = None

    @classmethod
    def from_settings(cls) -> RedisClient:
        """Create a client from application settings."""
        settings = get_settings()
        return cls(settings.REDIS_URL)

    @classmethod
    def from_url(cls, url: str) -> RedisClient:
        """Create a client from a raw Redis URL."""
        return cls(url)

    @property
    def client(self) -> aioredis.Redis[str]:
        """Lazy-initialize and return the underlying aioredis client."""
        if self._client is None:
            self._client = aioredis.from_url(
                self._url, decode_responses=self._decode_responses
            )
        return self._client

    async def get(self, key: str) -> str | None:
        value: str | None = await self.client.get(key)
        return value

    async def set(
        self, key: str, value: Any, *, ex: int | None = None
    ) -> bool | None:
        result: bool | None = await self.client.set(key, value, ex=ex)
        return result

    async def delete(self, *keys: str) -> int:
        deleted: int = await self.client.delete(*keys)
        return deleted

    async def exists(self, *keys: str) -> int:
        count: int = await self.client.exists(*keys)
        return count

    async def expire(self, key: str, seconds: int) -> bool:
        result: bool = await self.client.expire(key, seconds)
        return result

    async def keys(self, pattern: str = "*") -> list[str]:
        keys_list: list[str] = await self.client.keys(pattern)
        return keys_list

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None


# ── Backward-compatible module-level singleton ────────────────────────────

_client: RedisClient | None = None


def get_redis() -> aioredis.Redis[str]:
    """Return the process-wide async Redis client (lazy, legacy API)."""
    global _client
    if _client is None:
        _client = RedisClient.from_settings()
    return _client.client


async def close_redis() -> None:
    """Close the singleton client if it was created (legacy API)."""
    global _client
    if _client is not None:
        await _client.close()
        _client = None
