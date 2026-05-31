"""Conversation service: persist and fetch project messages."""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.plans import Message
from telaios.domain.enums import PlanMessageRole
from telaios.modules.projects.conversation.schemas import ConversationMessageRead


class ConversationService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_history(
        self, project_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> tuple[list[ConversationMessageRead], int]:
        stmt = (
            select(Message)
            .where(
                Message.project_id == project_id,
                Message.plan_id.is_(None),
                Message.deleted_at.is_(None),
            )
            .order_by(Message.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
        count_stmt = (
            select(func.count())
            .select_from(Message)
            .where(
                Message.project_id == project_id,
                Message.plan_id.is_(None),
                Message.deleted_at.is_(None),
            )
        )
        result = await self._session.execute(stmt)
        count_result = await self._session.execute(count_stmt)
        messages = result.scalars().all()
        total = count_result.scalar_one()
        return [ConversationMessageRead.model_validate(m) for m in messages], total

    async def save_user_message(
        self,
        project_id: uuid.UUID,
        content: str,
        user_id: uuid.UUID | None,
    ) -> ConversationMessageRead:
        msg = Message(
            project_id=project_id,
            plan_id=None,
            user_id=user_id,
            role=PlanMessageRole.USER,
            sender_type="user",
            specialist=None,
            content=content,
        )
        self._session.add(msg)
        await self._session.commit()
        await self._session.refresh(msg)
        return ConversationMessageRead.model_validate(msg)

    async def save_agent_message(
        self,
        project_id: uuid.UUID,
        content: str,
        specialist: str,
    ) -> ConversationMessageRead:
        msg = Message(
            project_id=project_id,
            plan_id=None,
            user_id=None,
            role=PlanMessageRole.ASSISTANT,
            sender_type="agent",
            specialist=specialist,
            content=content,
        )
        self._session.add(msg)
        await self._session.commit()
        await self._session.refresh(msg)
        return ConversationMessageRead.model_validate(msg)
