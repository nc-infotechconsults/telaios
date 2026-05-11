"""Document comments DB repository."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentComment


class CommentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_document(self, document_id: uuid.UUID) -> list[DocumentComment]:
        result = await self._s.execute(
            select(DocumentComment)
            .where(DocumentComment.document_id == document_id)
            .order_by(DocumentComment.created_at)
        )
        return list(result.scalars().all())

    async def find(self, comment_id: uuid.UUID) -> DocumentComment | None:
        result = await self._s.execute(
            select(DocumentComment).where(DocumentComment.id == comment_id)
        )
        return result.scalar_one_or_none()

    async def create(self, document_id: uuid.UUID, **kwargs: Any) -> DocumentComment:
        obj = DocumentComment(document_id=document_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(select(DocumentComment).where(DocumentComment.id == obj.id))
        return result.scalar_one()

    async def save(self, obj: DocumentComment) -> DocumentComment:
        await self._s.flush()
        result = await self._s.execute(select(DocumentComment).where(DocumentComment.id == obj.id))
        return result.scalar_one()

    async def delete_comment(self, obj: DocumentComment) -> None:
        await self._s.delete(obj)
        await self._s.flush()


__all__ = ["CommentRepository"]
