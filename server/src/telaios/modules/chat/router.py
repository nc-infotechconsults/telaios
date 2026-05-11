"""Chat / SSE router.

Routes:
  GET   /chat/{plan_id}/stream    — SSE stream for a planning session
  POST  /chat/{plan_id}/message   — persist user message + broadcast (202 Accepted)

Both endpoints require the caller to be a project member (viewer+) on the plan's
project.  RBAC is resolved inline by loading the plan from the DB.

Note: Full LLM planning session wiring is Phase 7+.  The send_message endpoint
persists the message to the DB and broadcasts it via SSE so the frontend can
display it immediately.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncGenerator, Callable

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership
from telaios.db.session import get_session
from telaios.infra import sse as sse_manager
from telaios.modules.messages.schemas import MessageCreate, MessageRead
from telaios.modules.messages.service import MessageService
from telaios.modules.plans.repository import PlanRepository
from telaios.utils.errors import BadRequestError, NotFoundError

logger = logging.getLogger(__name__)

HEARTBEAT_INTERVAL = 20  # seconds


# ─── RBAC helper ──────────────────────────────────────────────────────────────


def _require_chat_access(min_role: str = "viewer") -> Callable[..., object]:
    async def _dep(
        plan_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Principal:
        repo = PlanRepository(session)
        plan = await repo.find_with_deleted(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        await check_project_membership(plan.project_id, principal, session, min_role)
        return principal

    return _dep


# ─── Router ───────────────────────────────────────────────────────────────────

chat_router = APIRouter(prefix="/chat", tags=["chat"])


@chat_router.get(
    "/{plan_id}/stream",
    dependencies=[Depends(_require_chat_access("viewer"))],
)
async def chat_stream(
    plan_id: uuid.UUID,
    request: Request,
) -> StreamingResponse:
    """SSE stream for a planning session."""

    async def event_generator() -> AsyncGenerator[str]:
        heartbeat_task = asyncio.create_task(_heartbeat(str(plan_id)))
        try:
            async for data in sse_manager.event_stream(str(plan_id)):
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


@chat_router.post(
    "/{plan_id}/message",
    status_code=202,
    response_model=MessageRead,
    dependencies=[Depends(_require_chat_access("viewer"))],
)
async def send_message(
    plan_id: uuid.UUID,
    body: MessageRequest,
    session: AsyncSession = Depends(get_session),
) -> MessageRead:
    """Persist a user message and broadcast it to active SSE streams (202 Accepted)."""
    if not body.content.strip():
        raise BadRequestError("Message content cannot be empty")

    repo = PlanRepository(session)
    plan = await repo.find_with_deleted(plan_id)
    if plan is None:
        raise NotFoundError("Plan not found")

    msg = await MessageService(session).create(
        project_id=plan.project_id,
        dto=MessageCreate(role="user", content=body.content, plan_id=plan_id),
    )
    sse_manager.broadcast(str(plan_id), {"type": "message", "data": msg.model_dump(mode="json")})
    return msg


__all__ = ["chat_router"]
