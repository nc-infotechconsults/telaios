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


__all__ = ["ChunkService"]
