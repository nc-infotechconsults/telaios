"""Task artifacts service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.tasks.artifacts.repository import ArtifactRepository
from telaios.modules.tasks.artifacts.schemas import ArtifactCreate, ArtifactRead


class ArtifactService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = ArtifactRepository(session)

    async def list_by_task(self, task_id: uuid.UUID) -> list[ArtifactRead]:
        artifacts = await self._repo.list_by_task(task_id)
        return [ArtifactRead.model_validate(a) for a in artifacts]

    async def create_bulk(
        self, task_id: uuid.UUID, artifacts: list[ArtifactCreate]
    ) -> list[ArtifactRead]:
        created = []
        for dto in artifacts:
            a = await self._repo.create(
                task_id=task_id,
                type=dto.type,
                title=dto.title,
                content=dto.content,
                content_type=dto.content_type,
                artifact_metadata=dto.artifact_metadata,
                sort_order=dto.sort_order,
            )
            created.append(ArtifactRead.model_validate(a))
        return created
