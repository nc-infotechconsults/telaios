"""Document activities DB repository."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentActivity


class ActivityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_document(self, document_id: uuid.UUID) -> list[DocumentActivity]:
        result = await self._s.execute(
            select(DocumentActivity)
            .where(DocumentActivity.document_id == document_id)
            .order_by(DocumentActivity.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_by_project(self, project_id: uuid.UUID) -> list[DocumentActivity]:
        from telaios.db.models.documents import Document

        result = await self._s.execute(
            select(DocumentActivity)
            .join(Document, Document.id == DocumentActivity.document_id)
            .where(Document.project_id == project_id)
            .order_by(DocumentActivity.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, document_id: uuid.UUID, **kwargs: Any) -> DocumentActivity:
        obj = DocumentActivity(document_id=document_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()
        return obj


__all__ = ["ActivityRepository"]
