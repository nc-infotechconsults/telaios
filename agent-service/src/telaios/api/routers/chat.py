"""
api/routers/chat.py
-------------------
Chat/SSE streaming endpoints for planning sessions.

Chat/SSE transport for planning sessions.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from telaios.domain.planning import handle_user_message, init_session
from telaios.infra import sse as sse_manager

logger = logging.getLogger(__name__)

router = APIRouter()

HEARTBEAT_INTERVAL = 20  # seconds


@router.get("/chat/{plan_id}/stream")
async def chat_stream(plan_id: str, request: Request) -> StreamingResponse:
    """
    SSE stream for a planning session.

    Events follow the shape ``data: {json}\\n\\n`` where ``json`` contains
    ``type`` and payload fields consistent with the TypeScript service contract.
    """

    async def event_generator():
        await init_session(plan_id)

        heartbeat_task = asyncio.create_task(_heartbeat(plan_id))

        try:
            async for data in sse_manager.event_stream(plan_id):
                if await request.is_disconnected():
                    break
                yield data
        except asyncio.CancelledError:
            pass
        finally:
            heartbeat_task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


async def _heartbeat(plan_id: str) -> None:
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        sse_manager.broadcast(plan_id, {"type": "heartbeat"})


class MessageRequest(BaseModel):
    content: str


@router.post("/chat/{plan_id}/message", status_code=202)
async def send_message(plan_id: str, body: MessageRequest) -> dict:
    """
    Send a user message to the planning session.
    Returns 202 Accepted immediately; processing happens asynchronously.
    """
    if not body.content or not body.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    asyncio.create_task(handle_user_message(plan_id, body.content))
    return {"status": "accepted"}
