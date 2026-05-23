"""Document chunks DB repository — Qdrant-backed.

Text content and metadata live in PostgreSQL; embeddings and similarity
search are handled by Qdrant via KnowledgePipelineFactory.

Sources:
  - Qdrant filtering: https://qdrant.tech/documentation/concepts/filtering/
  - Qdrant search: https://qdrant.tech/documentation/concepts/search/
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentChunk

_COLLECTION = "document-chunks"


class ChunkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session
        self._vs: Any = None

    async def _get_vector_store(self) -> Any:
        """Lazy-init QdrantVectorStore from the global pipeline singleton."""
        if self._vs is None:
            from telaios.core.knowledge.factory import KnowledgePipelineFactory
            pipeline = await KnowledgePipelineFactory.get()
            self._vs = pipeline._vs
        return self._vs

    async def list_by_document(self, document_id: uuid.UUID) -> list[DocumentChunk]:
        result = await self._s.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index)
        )
        return list(result.scalars().all())

    async def list_as_dicts(self, document_id: uuid.UUID) -> list[dict[str, Any]]:
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
        query: str,
        limit: int = 8,
        document_id: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        """Similarity search via Qdrant with project_id payload filter."""
        vs = await self._get_vector_store()
        vector = await vs.embed_query(query)

        extra_filter: dict[str, Any] = {}
        if document_id is not None:
            extra_filter["document_id"] = str(document_id)

        hits = await vs.search(
            collection=_COLLECTION,
            vector=vector,
            project_id=str(project_id),
            top_k=limit,
            extra_filter=extra_filter or None,
        )

        return [
            {
                "content": hit.get("content", ""),
                "chunk_index": hit.get("metadata", {}).get("chunk_index", idx),
                "document_id": hit.get("metadata", {}).get("document_id", ""),
                "metadata": {
                    k: v
                    for k, v in hit.get("metadata", {}).items()
                    if k not in ("project_id", "document_id", "chunk_index")
                },
                "score": hit.get("score", 0.0),
                "qdrant_point_id": hit.get("id", ""),
            }
            for idx, hit in enumerate(hits)
        ]

    async def bulk_create(
        self, document_id: uuid.UUID, chunks: list[dict[str, Any]]
    ) -> list[DocumentChunk]:
        """Store text-only chunks in PostgreSQL, embeddings in Qdrant."""
        project_id = await self._resolve_project_id(document_id)
        vs = await self._get_vector_store()

        objs: list[DocumentChunk] = []
        texts: list[str] = []
        payloads: list[dict[str, Any]] = []

        for c in chunks:
            point_id = str(uuid.uuid4())
            texts.append(c["content"])
            payloads.append(
                {
                    "project_id": str(project_id),
                    "document_id": str(document_id),
                    "chunk_index": c.get("chunk_index", 0),
                    "content": c["content"],
                    **c.get("metadata", {}),
                }
            )
            objs.append(
                DocumentChunk(
                    document_id=document_id,
                    chunk_index=c.get("chunk_index", 0),
                    content=c["content"],
                    qdrant_point_id=point_id,
                    chunk_metadata=c.get("metadata"),
                )
            )

        self._s.add_all(objs)
        await self._s.flush()

        await vs.upsert(collection=_COLLECTION, texts=texts, payloads=payloads)

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

    async def _resolve_project_id(self, document_id: uuid.UUID) -> uuid.UUID:
        from telaios.db.models.documents import Document

        q = select(Document.project_id).where(Document.id == document_id)
        r = await self._s.execute(q)
        pid = r.scalar_one_or_none()
        if pid is None:
            raise ValueError(f"Document {document_id} not found")
        return pid


__all__ = ["ChunkRepository"]
