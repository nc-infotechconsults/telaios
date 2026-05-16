"""Document chunks DB repository — Chroma-backed.

Text content and metadata live in PostgreSQL; embeddings and similarity
search are handled by Chroma via the ``RagManager``.

Sources:
  - Chroma ``collection.query()``:
    https://docs.trychroma.com/docs/querying-collections/query-and-get#query
  - Chroma ``collection.add()``:
    https://docs.trychroma.com/docs/collections/add-data
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.core.rag_manager import RagManager
from telaios.core.types import RetrievalQuery
from telaios.db.models.documents import DocumentChunk

_COLLECTION = "document-chunks"


class ChunkRepository:
    def __init__(self, session: AsyncSession, rag: RagManager | None = None) -> None:
        self._s = session
        self._rag = rag

    @property
    def rag(self) -> RagManager:
        if self._rag is None:
            self._rag = RagManager()
        return self._rag

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
        """Similarity search via Chroma text query.

        Chroma embeds the query text and returns nearest-neighbor chunks.
        Filters by *project_id* via metadata. Optionally restricts to a
        specific *document_id*.

        Source:
          https://docs.trychroma.com/docs/querying-collections/query-and-get#query
        """
        filters: dict[str, Any] = {"project_id": str(project_id)}
        if document_id is not None:
            filters["document_id"] = str(document_id)

        retriever = self.rag.create_retriever(_COLLECTION)
        result = retriever.retrieve(RetrievalQuery(text=query, top_k=limit, filters=filters))

        return [
            {
                "content": chunk.content,
                "chunk_index": chunk.metadata.get("chunk_index", idx),
                "document_id": chunk.metadata.get("document_id", chunk.document_id),
                "metadata": {
                    k: v
                    for k, v in chunk.metadata.items()
                    if k not in ("project_id", "document_id", "chunk_index")
                },
                "distance": 1.0 - score if score < 1 else 0.0,
                "chroma_doc_id": chunk.id,
            }
            for idx, (chunk, score) in enumerate(zip(result.chunks, result.scores, strict=True))
        ]

    async def bulk_create(
        self, document_id: uuid.UUID, chunks: list[dict[str, Any]]
    ) -> list[DocumentChunk]:
        """Store text-only chunks in PostgreSQL, embeddings in Chroma.

        Each chunk gets a ``chroma_doc_id`` linking the DB row to its
        Chroma embedding.
        """
        project_id = await self._resolve_project_id(document_id)

        objs: list[DocumentChunk] = []
        chroma_ids: list[str] = []
        chroma_texts: list[str] = []
        chroma_metas: list[dict[str, Any]] = []

        for c in chunks:
            chunk_id = str(uuid.uuid4())
            chroma_ids.append(chunk_id)
            chroma_texts.append(c["content"])
            chroma_metas.append(
                {
                    "project_id": str(project_id),
                    "document_id": str(document_id),
                    "chunk_index": c.get("chunk_index", 0),
                    **c.get("metadata", {}),
                }
            )

            objs.append(
                DocumentChunk(
                    document_id=document_id,
                    chunk_index=c.get("chunk_index", 0),
                    content=c["content"],
                    chroma_doc_id=chunk_id,
                    chunk_metadata=c.get("metadata"),
                )
            )

        # Store in PostgreSQL
        self._s.add_all(objs)
        await self._s.flush()

        # Store in Chroma
        self.rag.ingest(
            _COLLECTION,
            ids=chroma_ids,
            documents=chroma_texts,
            metadatas=chroma_metas,
        )

        result = await self._s.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index)
        )
        return list(result.scalars().all())

    async def delete_by_document(self, document_id: uuid.UUID) -> int:
        """Delete chunks from PostgreSQL. Chroma entries are kept for history."""
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
