from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Dict, Optional, Set

logger = logging.getLogger(__name__)

# Map plan_id → set of asyncio queues (one per connected SSE client)
_clients: Dict[str, Set[asyncio.Queue]] = {}


def _prune_empty(plan_id: str) -> None:
    if not _clients.get(plan_id):
        _clients.pop(plan_id, None)


async def event_stream(plan_id: str) -> AsyncIterator[str]:
    """
    Async generator that yields SSE-formatted strings for a specific plan.

    Registers a queue, yields events until the client disconnects or the
    sentinel ``None`` is placed in the queue.
    """
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
    """Send an event to all SSE clients subscribed to ``plan_id``."""
    raw = f"data: {json.dumps(event)}\n\n"
    queues = _clients.get(plan_id, set())
    dead: Set[asyncio.Queue] = set()
    for q in queues:
        try:
            q.put_nowait(raw)
        except asyncio.QueueFull:
            dead.add(q)
        except Exception:
            dead.add(q)
    for q in dead:
        queues.discard(q)
    _prune_empty(plan_id)


def broadcast_all(event: Any) -> None:
    """Broadcast an event to all connected SSE clients (all plan IDs)."""
    for plan_id in list(_clients.keys()):
        broadcast(plan_id, event)
