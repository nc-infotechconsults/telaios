"""KnowledgeBasePipeline — the single entry point for all knowledge operations."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

from telaios.core.knowledge.config import KnowledgePipelineConfig
from telaios.core.knowledge.graph import GraphAugmentor
from telaios.core.knowledge.hyde import HyDE
from telaios.core.knowledge.ingestion import IngestResult, IngestionService
from telaios.core.knowledge.retrieval import HybridRetriever
from telaios.core.retriever import Retriever
from telaios.core.stores.bm25 import BM25Store
from telaios.core.stores.qdrant import QdrantVectorStore
from telaios.core.types import Chunk, RetrievalQuery

logger = logging.getLogger(__name__)

SourceLiteral = Literal["all", "documents", "repositories"]


@dataclass
class KnowledgeQueryResult:
    query: str
    chunks: list[Chunk]
    scores: list[float]
    sources_searched: list[str]


class KnowledgeBasePipeline:
    """
    Single production pipeline for cross-knowledge-base retrieval and Q&A.

    Fixed internal sequence:
      Query → HyDE → Hybrid (Qdrant + BM25 + RRF) → Graph Augmentation → Response

    Ingestion:
      Source → Chunker (AST for code, Semantic for docs) → Graph Index → Qdrant → BM25

    Two global Qdrant collections, logically partitioned by project_id payload filter.
    """

    def __init__(
        self,
        vector_store: QdrantVectorStore,
        bm25_store: BM25Store,
        graph_augmentor: GraphAugmentor,
        hyde: HyDE,
        llm: Any,
        ingestion: IngestionService,
        config: KnowledgePipelineConfig,
    ) -> None:
        self._vs = vector_store
        self._bm25 = bm25_store
        self._graph = graph_augmentor
        self._hyde = hyde
        self._llm = llm
        self._ingestion = ingestion
        self._config = config

    # ── Retrieval ─────────────────────────────────────────────────────────────

    async def query(
        self,
        project_id: str,
        text: str,
        source: SourceLiteral = "all",
        top_k: int | None = None,
    ) -> KnowledgeQueryResult:
        """Hybrid retrieve across documents, repositories, or both."""
        k = top_k or self._config.top_k
        sources_searched: list[str] = []
        all_chunks: list[Chunk] = []
        all_scores: list[float] = []

        collections = self._resolve_collections(source)
        for collection in collections:
            retriever = self._make_retriever(collection, project_id)
            result = await retriever.aretrieve(RetrievalQuery(text=text, top_k=k))
            for chunk, score in zip(result.chunks, result.scores, strict=False):
                chunk.metadata["_collection"] = collection
            all_chunks.extend(result.chunks)
            all_scores.extend(result.scores)
            sources_searched.append(collection)

        # Re-sort fused results across collections by score
        if len(collections) > 1:
            paired = sorted(zip(all_chunks, all_scores), key=lambda x: x[1], reverse=True)
            all_chunks = [c for c, _ in paired[:k]]
            all_scores = [s for _, s in paired[:k]]

        # Graph augmentation
        if self._config.graph_augmentation_enabled:
            all_chunks = await self._graph.augment(all_chunks, text)

        return KnowledgeQueryResult(
            query=text,
            chunks=all_chunks,
            scores=all_scores,
            sources_searched=sources_searched,
        )

    def get_retriever(
        self,
        collection: Literal["documents", "repositories"],
        project_id: str | None,
    ) -> Retriever:
        """Return a Retriever-compatible object for direct use in agent tools."""
        real_collection = (
            self._config.documents_collection
            if collection == "documents"
            else self._config.repositories_collection
        )
        return self._make_retriever(real_collection, project_id)

    # ── Ingestion ─────────────────────────────────────────────────────────────

    async def ingest_documents(
        self,
        project_id: str,
        source: Any,  # KnowledgeSource
    ) -> IngestResult:
        """Ingest documents (PDF, DOCX, MD, etc.) using SemanticChunker."""
        from telaios.core.chunkers.semantic import SemanticChunker
        chunker = SemanticChunker(
            chunk_size=self._config.document_chunk_size,
            overlap=self._config.document_chunk_overlap,
        )
        return await self._ingestion.ingest(
            source=source,
            collection=self._config.documents_collection,
            project_id=project_id,
            chunker=chunker,
        )

    async def ingest_repository(
        self,
        project_id: str,
        source: Any,  # KnowledgeSource (FileSource or GitHubSource)
        language: str = "python",
    ) -> IngestResult:
        """Ingest a code repository using ASTChunker (Python) or SemanticChunker fallback."""
        from telaios.core.chunkers.ast import ASTChunker
        chunker = ASTChunker(
            chunk_size=self._config.document_chunk_size,
            language=language,
            max_lines=self._config.code_chunk_max_lines,
        )
        return await self._ingestion.ingest(
            source=source,
            collection=self._config.repositories_collection,
            project_id=project_id,
            chunker=chunker,
        )

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def warm_up(self, project_ids: list[str] | None = None) -> None:
        """Rebuild in-memory BM25 indexes from Qdrant on startup."""
        for collection in [
            self._config.documents_collection,
            self._config.repositories_collection,
        ]:
            try:
                if project_ids:
                    for pid in project_ids:
                        docs = await self._vs.scroll_all(collection=collection, project_id=pid)
                        if docs:
                            self._bm25.rebuild(collection=collection, docs=docs, project_id=pid)
                            logger.info("Warmed BM25: %d docs for project %r in %r", len(docs), pid, collection)
                else:
                    docs = await self._vs.scroll_all(collection=collection)
                    if docs:
                        self._bm25.rebuild(collection=collection, docs=docs)
                        logger.info("Warmed BM25: %d docs in %r (no project filter)", len(docs), collection)
            except Exception:
                logger.warning("BM25 warm-up failed for %r", collection, exc_info=True)

    async def delete_project_data(self, project_id: str) -> None:
        """Remove all vectors and BM25 index belonging to *project_id* from both collections."""
        for collection in [
            self._config.documents_collection,
            self._config.repositories_collection,
        ]:
            await self._vs.delete_by_project(collection=collection, project_id=project_id)
            self._bm25.delete_project(collection=collection, project_id=project_id)

    # ── Internals ─────────────────────────────────────────────────────────────

    def _resolve_collections(self, source: SourceLiteral) -> list[str]:
        match source:
            case "documents":
                return [self._config.documents_collection]
            case "repositories":
                return [self._config.repositories_collection]
            case _:
                return [self._config.documents_collection, self._config.repositories_collection]

    def _make_retriever(self, collection: str, project_id: str | None) -> HybridRetriever:
        return HybridRetriever(
            vector_store=self._vs,
            bm25_store=self._bm25,
            collection=collection,
            project_id=project_id,
            hyde=self._hyde if self._config.hyde_enabled else None,
            top_k=self._config.top_k,
            rrf_k=self._config.rrf_k,
        )


__all__ = ["KnowledgeBasePipeline", "KnowledgeQueryResult"]
