"""Document chunks service (used by extraction pipeline)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.documents.chunks.repository import ChunkRepository


class ChunkService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = ChunkRepository(session)

    async def store(
        self,
        document_id: uuid.UUID,
        chunks: list[dict[str, Any]],
    ) -> int:
        """Replace existing chunks for *document_id* with *chunks*.

        Returns the number of new chunks stored.
        """
        await self._repo.delete_by_document(document_id)
        stored = await self._repo.bulk_create(document_id, chunks)
        return len(stored)

    async def get_by_document(self, document_id: uuid.UUID) -> list[dict[str, Any]]:
        """Return all chunks for *document_id* as plain dicts.

        Each dict has keys: ``content``, ``chunk_index``, ``document_id``,
        ``metadata``.
        """
        return await self._repo.list_as_dicts(document_id)

    async def search_by_embedding(
        self,
        project_id: uuid.UUID,
        embedding: list[float],
        limit: int = 8,
        document_id: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Cosine-similarity ANN search (delegates to repository).

        Returns chunks ordered by ascending distance (most similar first).
        """
        return await self._repo.search_by_embedding(
            project_id, embedding, limit=limit, document_id=document_id
        )


__all__ = ["ChunkService"]
