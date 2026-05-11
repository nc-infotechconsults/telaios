"""Documents DB repository (CRUD)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from telaios.db.models.documents import Document


class DocumentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def _load_opts(self) -> list[Any]:
        return [selectinload(Document.tags)]

    async def list_by_project(
        self,
        project_id: uuid.UUID,
        *,
        folder_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[Document]:
        q = select(Document).where(
            Document.project_id == project_id,
            Document.deleted_at.is_(None),
        )
        if folder_id is not None:
            q = q.where(Document.folder_id == folder_id)
        if status is not None:
            q = q.where(Document.status == status)
        q = q.order_by(Document.created_at.desc()).options(*self._load_opts())
        result = await self._s.execute(q)
        return list(result.scalars().all())

    async def find(self, document_id: uuid.UUID) -> Document | None:
        result = await self._s.execute(
            select(Document)
            .where(Document.id == document_id, Document.deleted_at.is_(None))
            .options(*self._load_opts())
        )
        return result.scalar_one_or_none()

    async def find_with_deleted(self, document_id: uuid.UUID) -> Document | None:
        result = await self._s.execute(
            select(Document).where(Document.id == document_id).options(*self._load_opts())
        )
        return result.scalar_one_or_none()

    async def create(self, project_id: uuid.UUID, **kwargs: Any) -> Document:
        obj = Document(project_id=project_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(
            select(Document).where(Document.id == obj.id).options(*self._load_opts())
        )
        return result.scalar_one()

    async def save(self, obj: Document) -> Document:
        await self._s.flush()
        result = await self._s.execute(
            select(Document).where(Document.id == obj.id).options(*self._load_opts())
        )
        return result.scalar_one()

    async def soft_delete(self, obj: Document) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()

    async def trash(self, obj: Document) -> Document:
        """Move to trash (soft-delete)."""
        obj.deleted_at = datetime.now(UTC)
        return await self.save(obj)

    async def restore(self, obj: Document) -> Document:
        """Restore from trash."""
        obj.deleted_at = None
        return await self.save(obj)


__all__ = ["DocumentRepository"]
