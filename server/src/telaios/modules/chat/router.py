"""Chat / SSE router.

Routes:
  GET   /chat/{plan_id}/stream    — SSE stream for a planning session
  POST  /chat/{plan_id}/message   — persist user message + broadcast (202 Accepted)

Both endpoints require the caller to be a project member (viewer+) on the plan's
project.  RBAC is resolved via PlanService.get_orm() inside ChatService.

Note: Full LLM planning session wiring is Phase 7+.  The send_message endpoint
persists the message to the DB and broadcasts it via SSE so the frontend can
display it immediately.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator, Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.db.session import get_session
from telaios.infra import sse as sse_manager
from telaios.modules.chat.service import ChatService
from telaios.modules.messages.schemas import MessageRead
from telaios.modules.plans.service import PlanService
from telaios.utils.errors import BadRequestError, NotFoundError

chat_router = APIRouter(prefix="/chat", tags=["chat"])

HEARTBEAT_INTERVAL = 20


def _require_chat_access(min_role: str = "viewer") -> Callable[..., Any]:
    async def dep(
        plan_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Any:
        plan = await PlanService(session).get_orm(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        from telaios.auth.project_access import check_project_membership

        await check_project_membership(plan.project_id, principal, session, min_role)
        return principal

    return dep


async def _heartbeat(plan_id: str) -> None:
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        sse_manager.broadcast(plan_id, {"type": "heartbeat"})


class MessageRequest(BaseModel):
    content: str


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


@chat_router.post(
    "/{plan_id}/message",
    status_code=202,
    response_model=MessageRead,
    dependencies=[Depends(_require_chat_access("viewer"))],
)
async def send_message(
    plan_id: uuid.UUID,
    body: MessageRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MessageRead:
    """Persist a user message and trigger a planning turn (202 Accepted)."""
    if not body.content.strip():
        raise BadRequestError("Message content cannot be empty")

    plan_svc = PlanService(session)
    plan = await plan_svc.get_orm(plan_id)
    if plan is None:
        raise NotFoundError("Plan not found")

    chat_svc = ChatService(session)
    msg = await chat_svc.send_message(
        plan_id=plan_id,
        project_id=plan.project_id,
        content=body.content,
    )
    return msg


__all__ = ["chat_router"]
