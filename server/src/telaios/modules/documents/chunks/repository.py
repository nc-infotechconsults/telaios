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

    async def list_as_dicts(self, document_id: uuid.UUID) -> list[dict[str, Any]]:
        """Return chunks as plain dicts (content, chunk_index, metadata).

        Used by extraction and copilot services that only need the text content.
        """
        rows = await self.list_by_document(document_id)
        return [
            {
                "content": r.content,
                "chunk_index": r.chunk_index,
                "document_id": str(r.document_id),
                "metadata": r.chunk_metadata or {},
            }
            for r in rows
        ]

    async def search_by_embedding(
        self,
        project_id: uuid.UUID,
        embedding: list[float],
        limit: int = 8,
        document_id: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Cosine-similarity ANN search via pgvector.

        Filters by *project_id* (via JOIN on documents table). Optionally
        restricts to a specific *document_id*. Returns up to *limit* chunks
        ordered by ascending cosine distance (most similar first).
        """
        from pgvector.sqlalchemy import cosine_distance

        from telaios.db.models.documents import Document

        q = (
            select(DocumentChunk, cosine_distance(DocumentChunk.embedding, embedding).label("dist"))
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(Document.project_id == project_id)
            .where(DocumentChunk.embedding.is_not(None))
        )
        if document_id is not None:
            q = q.where(DocumentChunk.document_id == document_id)
        q = q.order_by("dist").limit(limit)

        result = await self._s.execute(q)
        return [
            {
                "content": row.DocumentChunk.content,
                "chunk_index": row.DocumentChunk.chunk_index,
                "document_id": str(row.DocumentChunk.document_id),
                "metadata": row.DocumentChunk.chunk_metadata or {},
                "distance": float(row.dist),
            }
            for row in result.all()
        ]

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
