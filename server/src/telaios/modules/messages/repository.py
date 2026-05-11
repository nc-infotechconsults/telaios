"""Messages DB repository."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.plans import Message


class MessageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_project(self, project_id: uuid.UUID) -> list[Message]:
        result = await self._s.execute(
            select(Message)
            .where(Message.project_id == project_id, Message.deleted_at.is_(None))
            .order_by(Message.created_at)
        )
        return list(result.scalars().all())

    async def list_by_plan(self, plan_id: uuid.UUID) -> list[Message]:
        result = await self._s.execute(
            select(Message)
            .where(Message.plan_id == plan_id, Message.deleted_at.is_(None))
            .order_by(Message.created_at)
        )
        return list(result.scalars().all())

    async def create(
        self,
        project_id: uuid.UUID,
        role: str,
        content: str,
        plan_id: uuid.UUID | None = None,
    ) -> Message:
        obj = Message(
            project_id=project_id,
            plan_id=plan_id,
            role=role,
            content=content,
        )
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(select(Message).where(Message.id == obj.id))
        return result.scalar_one()
