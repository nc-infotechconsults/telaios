"""Project agent repository."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.projects import ProjectAgent


class AgentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list(self, project_id: uuid.UUID) -> list[ProjectAgent]:
        result = await self._s.execute(
            select(ProjectAgent)
            .where(ProjectAgent.project_id == project_id)
            .order_by(ProjectAgent.created_at.asc())
        )
        return list(result.scalars().all())

    async def find(self, project_id: uuid.UUID, agent_id: uuid.UUID) -> ProjectAgent | None:
        result = await self._s.execute(
            select(ProjectAgent).where(
                ProjectAgent.id == agent_id,
                ProjectAgent.project_id == project_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> ProjectAgent:
        agent = ProjectAgent(**kwargs)
        self._s.add(agent)
        await self._s.flush()
        await self._s.refresh(agent)
        return agent

    async def save(self, agent: ProjectAgent) -> ProjectAgent:
        await self._s.flush()
        await self._s.refresh(agent)
        return agent

    async def delete(self, project_id: uuid.UUID, agent_id: uuid.UUID) -> None:
        agent = await self.find(project_id, agent_id)
        if agent:
            await self._s.delete(agent)
            await self._s.flush()
