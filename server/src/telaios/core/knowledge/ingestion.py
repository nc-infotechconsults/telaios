"""IngestionService — source → chunk → entity_extract → embed → store."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from telaios.core.types import Chunk

if TYPE_CHECKING:
    from telaios.core.chunkers.base import Chunker
    from telaios.core.knowledge.config import KnowledgePipelineConfig
    from telaios.core.knowledge.graph import GraphAugmentor
    from telaios.core.knowledge_source import KnowledgeSource
    from telaios.core.stores.bm25 import BM25Store
    from telaios.core.stores.qdrant import QdrantVectorStore

logger = logging.getLogger(__name__)


@dataclass
class IngestResult:
    collection: str
    project_id: str
    document_count: int
    chunk_count: int
    triplet_count: int = 0
    chunks: list[Chunk] = field(default_factory=list)


class IngestionService:
    """
    Orchestrates the full ingestion pipeline for one KnowledgeSource:

      source.extract()
        → chunker.chunk(doc.content)
        → graph_augmentor.index_document(doc_id, content)  [optional]
        → vector_store.upsert(collection, texts, payloads)
        → bm25_store.rebuild(collection, all_docs, project_id)
    """

    def __init__(
        self,
        vector_store: QdrantVectorStore,
        bm25_store: BM25Store,
        graph_augmentor: GraphAugmentor | None,
        config: KnowledgePipelineConfig,
    ) -> None:
        self._vs = vector_store
        self._bm25 = bm25_store
        self._graph = graph_augmentor
        self._config = config

    async def ingest(
        self,
        source: KnowledgeSource,
        collection: str,
        project_id: str,
        chunker: Chunker,
    ) -> IngestResult:
        docs = await source.extract()
        if not docs:
            return IngestResult(collection=collection, project_id=project_id, document_count=0, chunk_count=0)

        texts: list[str] = []
        payloads: list[dict[str, Any]] = []
        point_ids: list[str] = []
        chunk_objects: list[Chunk] = []
        triplet_count = 0

        for doc in docs:
            raw_chunks = chunker.chunk(doc.content)

            for chunk_text, meta in raw_chunks:
                pid = str(uuid.uuid4())
                chunk_meta: dict[str, Any] = {
                    "project_id": project_id,
                    "document_id": doc.id,
                    "source_path": doc.source_path,
                    "source_type": doc.source_type,
                    "heading": meta.heading,
                    "chunk_index": meta.index,
                    "start_char": meta.start_char,
                    "end_char": meta.end_char,
                    "title": doc.title,
                    "symbol_name": meta.symbol_name,
                    "symbol_type": meta.symbol_type,
                    "start_line": meta.start_line,
                    "end_line": meta.end_line,
                    "language": meta.language,
                    "_collection": collection,
                    **doc.metadata,
                }
                payload = {"content": chunk_text, **chunk_meta}
                texts.append(chunk_text)
                payloads.append(payload)
                point_ids.append(pid)
                chunk_objects.append(
                    Chunk(id=pid, document_id=doc.id, content=chunk_text, metadata=chunk_meta)
                )

            if self._graph is not None:
                await self._graph.index_document(doc.id, doc.content)

        await self._vs.upsert(
            collection=collection, texts=texts, payloads=payloads, ids=point_ids
        )
        logger.info(
            "Ingested %d docs / %d chunks into %r for project %r",
            len(docs), len(texts), collection, project_id,
        )

        await self._rebuild_bm25(collection, project_id)

        return IngestResult(
            collection=collection,
            project_id=project_id,
            document_count=len(docs),
            chunk_count=len(texts),
            triplet_count=triplet_count,
            chunks=chunk_objects,
        )

    async def _rebuild_bm25(self, collection: str, project_id: str) -> None:
        """Reload all docs for *project_id* from Qdrant and rebuild the BM25 index."""
        all_docs = await self._vs.scroll_all(collection=collection, project_id=project_id)
        self._bm25.rebuild(collection=collection, docs=all_docs, project_id=project_id)
        logger.debug("BM25 index rebuilt: %d docs for project %r in %r", len(all_docs), project_id, collection)


__all__ = ["IngestResult", "IngestionService"]
