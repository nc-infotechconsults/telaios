"""Project member repository."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from telaios.db.models.projects import ProjectMember
from telaios.modules.projects.schemas import ProjectRole


class MemberRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list(self, project_id: uuid.UUID) -> list[ProjectMember]:
        result = await self._s.execute(
            select(ProjectMember)
            .where(ProjectMember.project_id == project_id)
            .options(selectinload(ProjectMember.user))
            .order_by(ProjectMember.joined_at.asc())
        )
        return list(result.scalars().all())

    async def find(self, project_id: uuid.UUID, user_id: uuid.UUID) -> ProjectMember | None:
        result = await self._s.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def find_with_user(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> ProjectMember | None:
        result = await self._s.execute(
            select(ProjectMember)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
            .options(selectinload(ProjectMember.user))
        )
        return result.scalar_one_or_none()

    async def upsert(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role: ProjectRole
    ) -> ProjectMember:
        existing = await self.find(project_id, user_id)
        if existing:
            existing.role = role
            await self._s.flush()
        else:
            existing = ProjectMember(project_id=project_id, user_id=user_id, role=role)
            self._s.add(existing)
            await self._s.flush()
        await self._s.refresh(existing)
        return existing

    async def delete(self, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        member = await self.find(project_id, user_id)
        if member:
            await self._s.delete(member)
            await self._s.flush()
