"""Project member service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.projects.members.repository import MemberRepository
from telaios.modules.projects.schemas import MemberRead, ProjectRole
from telaios.utils.errors import NotFoundError


class MemberService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = MemberRepository(session)

    async def list_members(self, project_id: uuid.UUID) -> list[MemberRead]:
        members = await self._repo.list(project_id)
        return [MemberRead.model_validate(m) for m in members]

    async def add_member(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role: ProjectRole = ProjectRole.VIEWER
    ) -> MemberRead:
        await self._repo.upsert(project_id, user_id, role)
        member = await self._repo.find_with_user(project_id, user_id)
        if member is None:
            raise NotFoundError("Member not found after upsert")
        return MemberRead.model_validate(member)

    async def patch_member(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role: ProjectRole
    ) -> MemberRead:
        existing = await self._repo.find(project_id, user_id)
        if existing is None:
            raise NotFoundError("Member not found")
        await self._repo.upsert(project_id, user_id, role)
        member = await self._repo.find_with_user(project_id, user_id)
        if member is None:
            raise NotFoundError("Member not found after update")
        return MemberRead.model_validate(member)

    async def remove_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        await self._repo.delete(project_id, user_id)
