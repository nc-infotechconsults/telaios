"""Document activities business-logic service."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.documents.activities.repository import ActivityRepository
from telaios.modules.documents.activities.schemas import ActivityRead, DocumentActivityAction


class ActivityService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = ActivityRepository(session)

    async def list_by_document(self, document_id: uuid.UUID) -> list[ActivityRead]:
        items = await self._repo.list_by_document(document_id)
        return [ActivityRead.model_validate(a) for a in items]

    async def list_by_project(self, project_id: uuid.UUID) -> list[ActivityRead]:
        items = await self._repo.list_by_project(project_id)
        return [ActivityRead.model_validate(a) for a in items]

    async def record(
        self,
        document_id: uuid.UUID,
        action: DocumentActivityAction,
        user_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ActivityRead:
        item = await self._repo.create(
            document_id,
            action=action,
            user_id=user_id,
            activity_metadata=metadata,
        )
        return ActivityRead.model_validate(item)


__all__ = ["ActivityService"]
