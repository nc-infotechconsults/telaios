from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

_clients: dict[str, set[asyncio.Queue]] = {}


def _prune_empty(plan_id: str) -> None:
    if not _clients.get(plan_id):
        _clients.pop(plan_id, None)


async def event_stream(plan_id: str) -> AsyncIterator[str]:
    queue: asyncio.Queue = asyncio.Queue()
    _clients.setdefault(plan_id, set()).add(queue)
    try:
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event
    finally:
        _clients.get(plan_id, set()).discard(queue)
        _prune_empty(plan_id)


def broadcast(plan_id: str, event: Any) -> None:
    raw = f"data: {json.dumps(event)}\n\n"
    queues = _clients.get(plan_id, set())
    dead: set[asyncio.Queue] = set()
    for queue in queues:
        try:
            queue.put_nowait(raw)
        except Exception:
            dead.add(queue)
    for queue in dead:
        queues.discard(queue)
    _prune_empty(plan_id)


def broadcast_all(event: Any) -> None:
    for plan_id in list(_clients):
        broadcast(plan_id, event)
