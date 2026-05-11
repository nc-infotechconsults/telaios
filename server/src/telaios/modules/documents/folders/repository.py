"""Document folders DB repository."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentFolder


class FolderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_project(self, project_id: uuid.UUID) -> list[DocumentFolder]:
        result = await self._s.execute(
            select(DocumentFolder)
            .where(
                DocumentFolder.project_id == project_id,
                DocumentFolder.deleted_at.is_(None),
            )
            .order_by(DocumentFolder.path)
        )
        return list(result.scalars().all())

    async def find(self, folder_id: uuid.UUID) -> DocumentFolder | None:
        result = await self._s.execute(
            select(DocumentFolder).where(
                DocumentFolder.id == folder_id,
                DocumentFolder.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def find_with_deleted(self, folder_id: uuid.UUID) -> DocumentFolder | None:
        result = await self._s.execute(select(DocumentFolder).where(DocumentFolder.id == folder_id))
        return result.scalar_one_or_none()

    async def create(self, project_id: uuid.UUID, **kwargs: Any) -> DocumentFolder:
        obj = DocumentFolder(project_id=project_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(select(DocumentFolder).where(DocumentFolder.id == obj.id))
        return result.scalar_one()

    async def save(self, obj: DocumentFolder) -> DocumentFolder:
        await self._s.flush()
        result = await self._s.execute(select(DocumentFolder).where(DocumentFolder.id == obj.id))
        return result.scalar_one()

    async def soft_delete(self, obj: DocumentFolder) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()


__all__ = ["FolderRepository"]
