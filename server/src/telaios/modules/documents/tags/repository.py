"""Document tags DB repository."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentTag, document_document_tags


class TagRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_project(self, project_id: uuid.UUID) -> list[DocumentTag]:
        result = await self._s.execute(
            select(DocumentTag)
            .where(DocumentTag.project_id == project_id)
            .order_by(DocumentTag.name)
        )
        return list(result.scalars().all())

    async def find(self, tag_id: uuid.UUID) -> DocumentTag | None:
        result = await self._s.execute(select(DocumentTag).where(DocumentTag.id == tag_id))
        return result.scalar_one_or_none()

    async def create(self, project_id: uuid.UUID, **kwargs: Any) -> DocumentTag:
        obj = DocumentTag(project_id=project_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(select(DocumentTag).where(DocumentTag.id == obj.id))
        return result.scalar_one()

    async def save(self, obj: DocumentTag) -> DocumentTag:
        await self._s.flush()
        result = await self._s.execute(select(DocumentTag).where(DocumentTag.id == obj.id))
        return result.scalar_one()

    async def delete_tag(self, obj: DocumentTag) -> None:
        await self._s.delete(obj)
        await self._s.flush()

    # ── Junction table ops ────────────────────────────────────────────────

    async def add_to_document(self, document_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        stmt = (
            pg_insert(document_document_tags)
            .values(document_id=document_id, tag_id=tag_id)
            .on_conflict_do_nothing()
        )
        await self._s.execute(stmt)
        await self._s.flush()

    async def remove_from_document(self, document_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        await self._s.execute(
            delete(document_document_tags).where(
                document_document_tags.c.document_id == document_id,
                document_document_tags.c.tag_id == tag_id,
            )
        )
        await self._s.flush()


__all__ = ["TagRepository"]
