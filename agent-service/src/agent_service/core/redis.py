from __future__ import annotations

import logging
from typing import Optional

import redis.asyncio as aioredis

from agent_service.config import config

logger = logging.getLogger(__name__)

_client: Optional[aioredis.Redis] = None


def get_redis() -> aioredis.Redis:
    """Return the singleton async Redis client."""
    global _client
    if _client is None:
        _client = aioredis.from_url(config.REDIS_URL, decode_responses=True)
        logger.info("Redis client created for %s", config.REDIS_URL)
    return _client
