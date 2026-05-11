"""Document favorites DB repository."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentFavorite


class FavoriteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_user_in_project(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[DocumentFavorite]:
        from telaios.db.models.documents import Document

        result = await self._s.execute(
            select(DocumentFavorite)
            .join(Document, Document.id == DocumentFavorite.document_id)
            .where(
                DocumentFavorite.user_id == user_id,
                Document.project_id == project_id,
                Document.deleted_at.is_(None),
            )
            .order_by(DocumentFavorite.created_at.desc())
        )
        return list(result.scalars().all())

    async def find(self, document_id: uuid.UUID, user_id: uuid.UUID) -> DocumentFavorite | None:
        result = await self._s.execute(
            select(DocumentFavorite).where(
                DocumentFavorite.document_id == document_id,
                DocumentFavorite.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, document_id: uuid.UUID, user_id: uuid.UUID) -> DocumentFavorite:
        obj = DocumentFavorite(document_id=document_id, user_id=user_id)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(
            select(DocumentFavorite).where(
                DocumentFavorite.document_id == document_id,
                DocumentFavorite.user_id == user_id,
            )
        )
        return result.scalar_one()

    async def delete_favorite(self, obj: DocumentFavorite) -> None:
        await self._s.delete(obj)
        await self._s.flush()


__all__ = ["FavoriteRepository"]
