"""IngestionService — source → chunk → entity_extract → embed → store."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

from telaios.core.knowledge.routes import build_file_index, extract_routes
from telaios.core.types import Chunk

if TYPE_CHECKING:
    from telaios.core.chunkers.base import Chunker
    from telaios.core.knowledge.config import KnowledgePipelineConfig
    from telaios.core.knowledge.graph import GraphAugmentor
    from telaios.core.knowledge_source import KnowledgeSource, SourceDocument
    from telaios.core.stores.bm25 import BM25Store
    from telaios.core.stores.qdrant import QdrantVectorStore

_CODE_LANGUAGES = {"python", "java", "typescript", "tsx", "javascript"}

ProgressFn = Callable[[str], None]

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
        chunker: Chunker | Callable[[SourceDocument], Chunker],
        on_progress: ProgressFn | None = None,
    ) -> IngestResult:
        def _emit(msg: str) -> None:
            if on_progress:
                on_progress(msg)

        _emit("Extracting from source…")
        docs = await source.extract()
        if not docs:
            _emit("No documents returned by source.")
            return IngestResult(collection=collection, project_id=project_id, document_count=0, chunk_count=0)

        _emit(f"Extracted {len(docs)} file(s) — chunking…")
        texts: list[str] = []
        payloads: list[dict[str, Any]] = []
        point_ids: list[str] = []
        chunk_objects: list[Chunk] = []
        triplet_count = 0
        # (doc, raw_chunks, doc_language) — collected for graph indexing after upsert
        _doc_index_targets: list[tuple[Any, list, str | None]] = []

        callable_chunker = callable(chunker)
        for doc in docs:
            active_chunker = chunker(doc) if callable_chunker else chunker
            raw_chunks = active_chunker.chunk(doc.content)

            # Collect language + symbol names for index chunk generation
            doc_language: str | None = None
            doc_symbol_names: list[tuple[str, str]] = []
            for _, meta in raw_chunks:
                if meta.language and not doc_language:
                    doc_language = meta.language
                if meta.symbol_name and meta.symbol_type:
                    doc_symbol_names.append((meta.symbol_name, meta.symbol_type))

            # Extract HTTP routes if this is a code file
            doc_routes = []
            route_by_handler: dict[str, Any] = {}
            if doc_language in _CODE_LANGUAGES:
                doc_routes = extract_routes(doc.content, doc_language)
                route_by_handler = {r.handler: r for r in doc_routes if r.handler}

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
                # Tag route handlers with their HTTP method + path
                if meta.symbol_name and meta.symbol_name in route_by_handler:
                    route = route_by_handler[meta.symbol_name]
                    chunk_meta["http_method"] = route.method
                    chunk_meta["route_path"] = route.path

                payload = {"content": chunk_text, **chunk_meta}
                texts.append(chunk_text)
                payloads.append(payload)
                point_ids.append(pid)
                chunk_objects.append(
                    Chunk(id=pid, document_id=doc.id, content=chunk_text, metadata=chunk_meta)
                )

            # Emit a file-level index chunk for code files so aggregation queries
            # ("how many REST APIs?") can retrieve a per-file overview.
            if doc_language in _CODE_LANGUAGES and (doc_symbol_names or doc_routes):
                index_text = build_file_index(
                    source_path=doc.source_path or "",
                    language=doc_language,
                    symbol_names=doc_symbol_names,
                    routes=doc_routes,
                )
                index_pid = str(uuid.uuid4())
                index_meta: dict[str, Any] = {
                    "project_id": project_id,
                    "document_id": doc.id,
                    "source_path": doc.source_path,
                    "source_type": doc.source_type,
                    "heading": None,
                    "chunk_index": -1,
                    "start_char": 0,
                    "end_char": len(doc.content),
                    "title": doc.title,
                    "symbol_name": None,
                    "symbol_type": "file_index",
                    "start_line": None,
                    "end_line": None,
                    "language": doc_language,
                    "_collection": collection,
                    **doc.metadata,
                }
                texts.append(index_text)
                payloads.append({"content": index_text, **index_meta})
                point_ids.append(index_pid)
                chunk_objects.append(
                    Chunk(id=index_pid, document_id=doc.id, content=index_text, metadata=index_meta)
                )

            # Stash for graph indexing (after upsert, so we don't block embedding)
            _doc_index_targets.append((doc, raw_chunks, doc_language))

        _emit(f"Chunked → {len(texts)} chunk(s) — embedding + upserting to Qdrant…")
        await self._vs.upsert(
            collection=collection, texts=texts, payloads=payloads, ids=point_ids
        )
        logger.info(
            "Ingested %d docs / %d chunks into %r for project %r",
            len(docs), len(texts), collection, project_id,
        )

        _emit("Rebuilding BM25 index…")
        await self._rebuild_bm25(collection, project_id)

        if self._graph is not None:
            _emit(f"Indexing graph entities for {len(docs)} document(s)…")
            for doc, raw_chunks, doc_language in _doc_index_targets:
                if doc_language in _CODE_LANGUAGES:
                    # Code: extract per-symbol chunk — precise, no character-window loss
                    await self._graph.index_chunks(doc.id, raw_chunks)
                else:
                    # Text/docs: extract from full content via sliding windows (no cap)
                    await self._graph.index_document(doc.id, doc.content)
            _emit("Rebuilding graph community summaries…")
            await self._graph.rebuild_communities()

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
