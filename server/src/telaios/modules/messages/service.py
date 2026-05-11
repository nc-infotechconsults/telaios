"""Messages business-logic service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.messages.repository import MessageRepository
from telaios.modules.messages.schemas import MessageCreate, MessageRead


class MessageService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = MessageRepository(session)

    async def list_by_project(self, project_id: uuid.UUID) -> list[MessageRead]:
        msgs = await self._repo.list_by_project(project_id)
        return [MessageRead.model_validate(m) for m in msgs]

    async def list_by_plan(self, plan_id: uuid.UUID) -> list[MessageRead]:
        msgs = await self._repo.list_by_plan(plan_id)
        return [MessageRead.model_validate(m) for m in msgs]

    async def create(self, project_id: uuid.UUID, dto: MessageCreate) -> MessageRead:
        msg = await self._repo.create(
            project_id=project_id,
            role=dto.role,
            content=dto.content,
            plan_id=dto.plan_id,
        )
        return MessageRead.model_validate(msg)
