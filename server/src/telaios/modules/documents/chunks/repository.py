"""Document chunks DB repository (used by the extraction pipeline)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentChunk


class ChunkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_document(self, document_id: uuid.UUID) -> list[DocumentChunk]:
        result = await self._s.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index)
        )
        return list(result.scalars().all())

    async def bulk_create(
        self, document_id: uuid.UUID, chunks: list[dict[str, Any]]
    ) -> list[DocumentChunk]:
        objs = [DocumentChunk(document_id=document_id, **c) for c in chunks]
        self._s.add_all(objs)
        await self._s.flush()
        result = await self._s.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index)
        )
        return list(result.scalars().all())

    async def delete_by_document(self, document_id: uuid.UUID) -> int:
        result = await self._s.execute(
            delete(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .returning(DocumentChunk.id)
        )
        rows = result.fetchall()
        await self._s.flush()
        return len(rows)


__all__ = ["ChunkRepository"]
