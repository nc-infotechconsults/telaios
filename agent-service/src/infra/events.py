from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Dict, List, Optional

from infra.settings import config

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "agent:event:"
EventHandler = Callable[[str, Any], None]


class AgentEventBus:
    def __init__(self, redis_url: str) -> None:
        import redis.asyncio as aioredis

        self._redis_url = redis_url
        self._publisher: Optional[aioredis.Redis] = None
        self._subscriber: Optional[aioredis.client.PubSub] = None
        self._handlers: Dict[str, List[EventHandler]] = {}
        self._listen_task: Optional[asyncio.Task] = None

    async def _ensure_started(self) -> None:
        if self._publisher is not None:
            return
        import redis.asyncio as aioredis

        self._publisher = aioredis.from_url(self._redis_url, decode_responses=True)
        sub_client = aioredis.from_url(self._redis_url, decode_responses=True)
        self._subscriber = sub_client.pubsub()
        await self._subscriber.psubscribe(f"{CHANNEL_PREFIX}*")
        self._listen_task = asyncio.create_task(self._listen_loop())

    async def _listen_loop(self) -> None:
        assert self._subscriber is not None
        try:
            async for message in self._subscriber.listen():
                if message["type"] != "pmessage":
                    continue
                channel: str = message["channel"]
                topic = channel[len(CHANNEL_PREFIX):]
                raw = message["data"]
                try:
                    payload = json.loads(raw)
                except Exception:
                    payload = raw
                self._dispatch(topic, payload)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("[AgentEventBus] listener error: %s", exc)

    async def publish(self, topic: str, payload: Any) -> None:
        await self._ensure_started()
        assert self._publisher is not None
        await self._publisher.publish(f"{CHANNEL_PREFIX}{topic}", json.dumps(payload))

    def on(self, topic: str, handler: EventHandler) -> None:
        self._handlers.setdefault(topic, []).append(handler)

    def off(self, topic: str, handler: EventHandler) -> None:
        handlers = self._handlers.get(topic, [])
        self._handlers[topic] = [handler_ for handler_ in handlers if handler_ is not handler]

    async def close(self) -> None:
        if self._listen_task:
            self._listen_task.cancel()
        if self._subscriber:
            await self._subscriber.punsubscribe()
            await self._subscriber.aclose()
        if self._publisher:
            await self._publisher.aclose()

    def _dispatch(self, topic: str, payload: Any) -> None:
        handlers = list(self._handlers.get(topic, [])) + list(self._handlers.get("*", []))
        for handler in handlers:
            try:
                handler(topic, payload)
            except Exception as exc:
                logger.error('[AgentEventBus] handler error for topic "%s": %s', topic, exc)


_instance: Optional[AgentEventBus] = None


def get_agent_event_bus() -> AgentEventBus:
    global _instance
    if _instance is None:
        _instance = AgentEventBus(config.REDIS_URL)
    return _instance
