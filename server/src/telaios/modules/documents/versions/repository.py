"""Document versions DB repository."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentVersion


class VersionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_document(self, document_id: uuid.UUID) -> list[DocumentVersion]:
        result = await self._s.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.version_number.desc())
        )
        return list(result.scalars().all())

    async def find(self, version_id: uuid.UUID) -> DocumentVersion | None:
        result = await self._s.execute(
            select(DocumentVersion).where(DocumentVersion.id == version_id)
        )
        return result.scalar_one_or_none()

    async def create(self, document_id: uuid.UUID, **kwargs: Any) -> DocumentVersion:
        obj = DocumentVersion(document_id=document_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(select(DocumentVersion).where(DocumentVersion.id == obj.id))
        return result.scalar_one()

    async def max_version_number(self, document_id: uuid.UUID) -> int:
        from sqlalchemy import func

        result = await self._s.execute(
            select(func.max(DocumentVersion.version_number)).where(
                DocumentVersion.document_id == document_id
            )
        )
        return result.scalar_one_or_none() or 0


__all__ = ["VersionRepository"]
