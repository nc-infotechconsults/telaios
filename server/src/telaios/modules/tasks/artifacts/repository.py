"""Task artifacts DB repository."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.tasks import TaskArtifact


class ArtifactRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_task(self, task_id: uuid.UUID) -> list[TaskArtifact]:
        result = await self._s.execute(
            select(TaskArtifact)
            .where(TaskArtifact.task_id == task_id, TaskArtifact.deleted_at.is_(None))
            .order_by(TaskArtifact.sort_order, TaskArtifact.created_at)
        )
        return list(result.scalars().all())

    async def create(self, task_id: uuid.UUID, **kwargs: object) -> TaskArtifact:
        obj = TaskArtifact(task_id=task_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(select(TaskArtifact).where(TaskArtifact.id == obj.id))
        return result.scalar_one()
