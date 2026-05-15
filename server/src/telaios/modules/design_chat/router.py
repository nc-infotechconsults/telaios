"""Design chat router.

Routes:
  GET    /projects/{project_id}/design/sessions
  POST   /projects/{project_id}/design/sessions
  GET    /design/sessions/{session_id}
  GET    /design/sessions/{session_id}/messages
  GET    /design/sessions/{session_id}/artifacts
  POST   /design/sessions/{session_id}/message
  GET    /design/sessions/{session_id}/stream
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator, Callable

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership, require_project_access
from telaios.db.session import get_session
from telaios.infra import sse as sse_manager
from telaios.modules.design_chat.schemas import (
    DesignArtifactRead,
    DesignMessageRead,
    DesignMessageRequest,
    DesignSessionCreate,
    DesignSessionPatch,
    DesignSessionRead,
)
from telaios.modules.design_chat.service import DesignChatService
from telaios.utils.errors import BadRequestError

HEARTBEAT_INTERVAL = 20


def _require_design_session_access(min_role: str = "viewer") -> Callable[..., object]:
    async def _dep(
        session_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Principal:
        service = DesignChatService(session)
        project_id = await service.get_session_project_id(session_id)
        await check_project_membership(project_id, principal, session, min_role)
        return principal

    return _dep


project_design_sessions_router = APIRouter(
    prefix="/projects/{project_id}/design/sessions",
    tags=["design-chat"],
)


@project_design_sessions_router.get(
    "",
    response_model=list[DesignSessionRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_design_sessions(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[DesignSessionRead]:
    return await DesignChatService(session).list_sessions(project_id)


@project_design_sessions_router.post(
    "",
    status_code=201,
    response_model=DesignSessionRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_design_session(
    project_id: uuid.UUID,
    body: DesignSessionCreate,
    session: AsyncSession = Depends(get_session),
) -> DesignSessionRead:
    return await DesignChatService(session).create_session(project_id, body)


design_sessions_router = APIRouter(
    prefix="/design/sessions",
    tags=["design-chat"],
)


@design_sessions_router.get(
    "/{session_id}",
    response_model=DesignSessionRead,
    dependencies=[Depends(_require_design_session_access("viewer"))],
)
async def get_design_session(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> DesignSessionRead:
    return await DesignChatService(session).get_session(session_id)


@design_sessions_router.patch(
    "/{session_id}",
    response_model=DesignSessionRead,
    dependencies=[Depends(_require_design_session_access("editor"))],
)
async def patch_design_session(
    session_id: uuid.UUID,
    body: DesignSessionPatch,
    session: AsyncSession = Depends(get_session),
) -> DesignSessionRead:
    return await DesignChatService(session).patch_session(session_id, body)


@design_sessions_router.get(
    "/{session_id}/messages",
    response_model=list[DesignMessageRead],
    dependencies=[Depends(_require_design_session_access("viewer"))],
)
async def list_design_messages(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[DesignMessageRead]:
    return await DesignChatService(session).list_messages(session_id)


@design_sessions_router.get(
    "/{session_id}/artifacts",
    response_model=list[DesignArtifactRead],
    dependencies=[Depends(_require_design_session_access("viewer"))],
)
async def list_design_artifacts(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[DesignArtifactRead]:
    return await DesignChatService(session).list_artifacts(session_id)


@design_sessions_router.post(
    "/{session_id}/message",
    status_code=202,
    response_model=DesignMessageRead,
    dependencies=[Depends(_require_design_session_access("editor"))],
)
async def send_design_message(
    session_id: uuid.UUID,
    body: DesignMessageRequest,
    session: AsyncSession = Depends(get_session),
) -> DesignMessageRead:
    content = body.content.strip()
    if not content:
        raise BadRequestError("Message content cannot be empty")

    service = DesignChatService(session)
    try:
        return await service.send_message(session_id, content)
    except Exception as exc:
        sse_manager.broadcast(str(session_id), {"type": "error", "message": str(exc)})
        sse_manager.broadcast(str(session_id), {"type": "design_chat_end"})
        raise


async def _heartbeat(session_id: str) -> None:
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        sse_manager.broadcast(session_id, {"type": "heartbeat"})


@design_sessions_router.get(
    "/{session_id}/stream",
    dependencies=[Depends(_require_design_session_access("viewer"))],
)
async def design_session_stream(
    session_id: uuid.UUID,
    request: Request,
) -> StreamingResponse:
    async def event_generator() -> AsyncGenerator[str]:
        heartbeat_task = asyncio.create_task(_heartbeat(str(session_id)))
        try:
            async for data in sse_manager.event_stream(str(session_id)):
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


__all__ = ["design_sessions_router", "project_design_sessions_router"]
