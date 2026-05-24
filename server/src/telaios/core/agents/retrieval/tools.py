"""Retrieval tool wrappers for the RetrievalAgent dispatcher."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from telaios.core.knowledge.query_router import QueryIntent, classify_query
from telaios.core.agents.retrieval.state import SearchStep
from telaios.core.types import Chunk, RetrievalQuery

logger = logging.getLogger(__name__)


def _resolve_collections(source: str, config: Any) -> list[str]:
    if source == "documents":
        return [config.documents_collection]
    if source == "repositories":
        return [config.repositories_collection]
    return [config.documents_collection, config.repositories_collection]


@dataclass
class RetrievalTools:
    vector_store: Any
    bm25_store: Any
    graph_augmentor: Any
    hyde: Any | None
    config: Any           # KnowledgePipelineConfig
    project_id: str
    source: str
    top_k: int

    async def execute(self, step: SearchStep) -> tuple[list[Chunk], list[float]]:
        match step.tool:
            case "vector_search":
                return await self._vector_search(step.sub_query)
            case "graph_structural":
                return await self._graph_structural(step.sub_query)
            case "bm25":
                return await self._bm25(step.sub_query)
            case "generated_docs":
                return await self._generated_docs(step.sub_query)
            case _:
                logger.warning("Unknown tool %r — falling back to vector_search", step.tool)
                return await self._vector_search(step.sub_query)

    async def _vector_search(self, query: str) -> tuple[list[Chunk], list[float]]:
        from telaios.core.knowledge.retrieval import HybridRetriever

        collections = _resolve_collections(self.source, self.config)
        all_chunks: list[Chunk] = []
        all_scores: list[float] = []

        for collection in collections:
            retriever = HybridRetriever(
                vector_store=self.vector_store,
                bm25_store=self.bm25_store,
                collection=collection,
                project_id=self.project_id,
                hyde=self.hyde if self.config.hyde_enabled else None,
                top_k=self.top_k,
                rrf_k=self.config.rrf_k,
                reranker=None,
                rerank_candidates=self.config.rerank_candidates,
            )
            result = await retriever.aretrieve(
                RetrievalQuery(text=query, top_k=self.top_k)
            )
            for chunk in result.chunks:
                chunk.metadata["_collection"] = collection
            all_chunks.extend(result.chunks)
            all_scores.extend(result.scores)

        return all_chunks, all_scores

    async def _graph_structural(self, query: str) -> tuple[list[Chunk], list[float]]:
        intent, params = classify_query(query)
        if intent == QueryIntent.SEMANTIC:
            intent_str = "dependency"
            params = {}
        else:
            intent_str = intent.value
        try:
            chunks = await self.graph_augmentor.query_structural(intent_str, params, self.project_id)
        except Exception:
            logger.warning("graph_structural tool failed for query %r", query, exc_info=True)
            chunks = []
        scores = [1.0] * len(chunks)
        return chunks, scores

    async def _bm25(self, query: str) -> tuple[list[Chunk], list[float]]:
        collections = _resolve_collections(self.source, self.config)
        all_chunks: list[Chunk] = []

        for collection in collections:
            results = self.bm25_store.search(
                collection=collection,
                query=query,
                project_id=self.project_id,
                top_k=self.top_k,
            )
            for doc in results:
                all_chunks.append(Chunk(
                    id=doc.get("id", ""),
                    document_id=doc.get("metadata", {}).get("document_id", ""),
                    content=doc.get("content", ""),
                    metadata=doc.get("metadata", {}),
                ))

        scores = [1.0] * len(all_chunks)
        return all_chunks, scores

    async def _generated_docs(self, query: str) -> tuple[list[Chunk], list[float]]:
        """Search the documents collection, post-filter to generated_doc chunks."""
        from telaios.core.knowledge.retrieval import HybridRetriever

        retriever = HybridRetriever(
            vector_store=self.vector_store,
            bm25_store=self.bm25_store,
            collection=self.config.documents_collection,
            project_id=self.project_id,
            hyde=self.hyde if self.config.hyde_enabled else None,
            top_k=self.top_k * 3,
            rrf_k=self.config.rrf_k,
            reranker=None,
            rerank_candidates=self.config.rerank_candidates,
        )
        result = await retriever.aretrieve(
            RetrievalQuery(text=query, top_k=self.top_k * 3)
        )

        filtered = [
            (c, s) for c, s in zip(result.chunks, result.scores)
            if c.metadata.get("source_type") == "generated_doc"
        ]
        if not filtered:
            filtered = list(zip(result.chunks[:self.top_k], result.scores[:self.top_k]))

        chunks = [c for c, _ in filtered[:self.top_k]]
        scores = [s for _, s in filtered[:self.top_k]]
        return chunks, scores


__all__ = ["RetrievalTools"]
