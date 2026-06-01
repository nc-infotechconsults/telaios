"""Project conversation router.

Endpoints:
  GET   /projects/{project_id}/conversation/messages  — paginated history
  POST  /projects/{project_id}/conversation/message   — send user message + stream AI
  GET   /projects/{project_id}/conversation/stream    — SSE stream
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session, get_sessionmaker
from telaios.infra import sse as sse_manager
from telaios.modules.projects.conversation.agent import ConversationAgent
from telaios.modules.projects.conversation.schemas import (
    ConversationHistoryResponse,
    ConversationMessageRead,
    ConversationMessageRequest,
)
from telaios.modules.projects.conversation.service import ConversationService

conversation_router = APIRouter(
    prefix="/projects/{project_id}/conversation",
    tags=["project-conversation"],
)

HEARTBEAT_INTERVAL = 20
_agent = ConversationAgent()


def _conv_channel(project_id: uuid.UUID) -> str:
    return f"conv:{project_id}"


@conversation_router.get(
    "/messages",
    response_model=ConversationHistoryResponse,
    dependencies=[Depends(require_project_access("viewer"))],
)
async def get_history(
    project_id: uuid.UUID,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    session: AsyncSession = Depends(get_session),
) -> ConversationHistoryResponse:
    svc = ConversationService(session)
    messages, total = await svc.get_history(project_id, limit=limit, offset=offset)
    return ConversationHistoryResponse(messages=messages, total=total)


@conversation_router.get(
    "/stream",
    dependencies=[Depends(require_project_access("viewer"))],
)
async def conversation_stream(
    project_id: uuid.UUID,
    request: Request,
) -> StreamingResponse:
    channel = _conv_channel(project_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        heartbeat_task = asyncio.create_task(_heartbeat(channel))
        try:
            async for data in sse_manager.event_stream(channel):
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
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@conversation_router.post(
    "/message",
    status_code=202,
    response_model=ConversationMessageRead,
    dependencies=[Depends(require_project_access("viewer"))],
)
async def send_message(
    project_id: uuid.UUID,
    body: ConversationMessageRequest,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ConversationMessageRead:
    svc = ConversationService(session)

    # Convert principal.id (str) to UUID
    try:
        caller_uuid = uuid.UUID(principal.id) if not principal.is_service else None
    except (ValueError, AttributeError):
        caller_uuid = None

    # Get conversation history before saving the new user message so it isn't duplicated
    history_msgs, _ = await svc.get_history(project_id, limit=20)
    history = [
        {"sender_type": m.sender_type, "content": m.content}
        for m in history_msgs
    ]

    # Persist user message
    user_msg = await svc.save_user_message(
        project_id=project_id,
        content=body.content,
        user_id=caller_uuid,
    )

    # Broadcast user message to SSE clients
    channel = _conv_channel(project_id)
    sse_manager.broadcast(channel, {
        "type": "message",
        "message": user_msg.model_dump(mode="json"),
    })

    # Detect specialist
    specialist = body.specialist or ConversationAgent.detect_specialist(body.content)

    # Broadcast agent-start event
    sse_manager.broadcast(channel, {
        "type": "agent_start",
        "specialist": specialist,
    })

    # Stream AI response in background (fire-and-forget)
    asyncio.create_task(
        _stream_agent_response(project_id, body.content, history, specialist, channel)
    )

    return user_msg


async def _stream_agent_response(
    project_id: uuid.UUID,
    user_message: str,
    history: list[dict[str, str]],
    specialist: str,
    channel: str,
) -> None:
    """Background task: stream AI response via SSE then persist.

    Opens a fresh DB session because the request session may already be closed
    by the time this background task runs.
    """
    tokens: list[str] = []
    try:
        async for token in _agent.stream(project_id, user_message, history, specialist):
            if token:
                tokens.append(token)
                sse_manager.broadcast(channel, {"type": "token", "token": token})
        full_content = "".join(tokens)
        if full_content:
            async with get_sessionmaker()() as bg_session:
                svc = ConversationService(bg_session)
                agent_msg = await svc.save_agent_message(project_id, full_content, specialist)
            sse_manager.broadcast(channel, {
                "type": "message",
                "message": agent_msg.model_dump(mode="json"),
            })
    except Exception as exc:
        sse_manager.broadcast(channel, {"type": "error", "detail": str(exc)})
    finally:
        sse_manager.broadcast(channel, {"type": "agent_end"})


async def _heartbeat(channel: str) -> None:
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        sse_manager.broadcast(channel, {"type": "heartbeat"})
