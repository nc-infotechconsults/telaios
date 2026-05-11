"""Messages router.

Routes:
  GET    /projects/{project_id}/messages     — list by project, viewer+
  POST   /projects/{project_id}/messages     — create, editor+
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.messages.schemas import MessageCreate, MessageRead
from telaios.modules.messages.service import MessageService

messages_router = APIRouter(
    prefix="/projects/{project_id}/messages",
    tags=["messages"],
)


@messages_router.get(
    "",
    response_model=list[MessageRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_messages(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[MessageRead]:
    return await MessageService(session).list_by_project(project_id)


@messages_router.post(
    "",
    status_code=201,
    response_model=MessageRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_message(
    project_id: uuid.UUID,
    body: MessageCreate,
    session: AsyncSession = Depends(get_session),
) -> MessageRead:
    return await MessageService(session).create(project_id, body)


__all__ = ["messages_router"]
