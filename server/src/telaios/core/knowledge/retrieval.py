"""HybridRetriever — Qdrant dense + BM25 sparse retrieval fused via RRF."""

from __future__ import annotations

import logging
from typing import Any

from telaios.core.retriever import Retriever
from telaios.core.types import Chunk, RetrievalQuery, RetrievalResult
from telaios.domain.enums import RelevanceTier

logger = logging.getLogger(__name__)


def score_to_tier(normalized_score: float) -> RelevanceTier:
    """Convert a normalized RRF score [0, 1] to a RelevanceTier."""
    if normalized_score >= 0.70:
        return RelevanceTier.HIGH
    if normalized_score >= 0.35:
        return RelevanceTier.MEDIUM
    return RelevanceTier.LOW


def _reciprocal_rank_fusion(
    ranked_lists: list[list[dict[str, Any]]],
    k: int = 60,
) -> list[tuple[dict[str, Any], float]]:
    """Merge multiple ranked lists via RRF. Higher score = more relevant."""
    scores: dict[str, float] = {}
    docs_by_id: dict[str, dict[str, Any]] = {}

    for ranked in ranked_lists:
        for rank, doc in enumerate(ranked, start=1):
            doc_id = doc.get("id", "")
            if not doc_id:
                continue
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
            docs_by_id[doc_id] = doc

    fused = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [(docs_by_id[doc_id], score) for doc_id, score in fused]


class HybridRetriever(Retriever):
    """
    Implements the Retriever ABC using Hybrid search:
      1. HyDE: generate hypothetical doc, embed it
      2. Qdrant dense search (cosine similarity)
      3. BM25 sparse search (in-memory)
      4. RRF fusion of both ranked lists
      5. Optional cross-encoder reranking
    """

    def __init__(
        self,
        vector_store: Any,          # QdrantVectorStore
        bm25_store: Any,            # BM25Store
        collection: str,
        project_id: str | None,
        hyde: Any | None,           # HyDE | None
        top_k: int = 5,
        rrf_k: int = 60,
        reranker: Any | None = None,        # CrossEncoderReranker | None
        rerank_candidates: int = 50,
    ) -> None:
        self._vs = vector_store
        self._bm25 = bm25_store
        self._collection = collection
        self._project_id = project_id
        self._hyde = hyde
        self._top_k = top_k
        self._rrf_k = rrf_k
        self._reranker = reranker
        self._rerank_candidates = rerank_candidates

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self.aretrieve(query))

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        top_k = query.top_k or self._top_k
        # Over-fetch for reranker; at least 2x for RRF quality
        fetch_k = max(self._rerank_candidates, top_k * 2) if self._reranker else top_k * 2

        # 1. Embed query (via HyDE if enabled, else direct)
        if self._hyde is not None:
            vector = await self._hyde.embed_query(query.text, self._collection)
        else:
            vector = await self._vs.embed_query(query.text, collection=self._collection)

        # 2. Dense retrieval
        dense_results = await self._vs.search(
            collection=self._collection,
            vector=vector,
            project_id=self._project_id,
            top_k=fetch_k,
        )

        # 3. Sparse retrieval
        sparse_results = self._bm25.search(
            collection=self._collection,
            query=query.text,
            project_id=self._project_id,
            top_k=fetch_k,
        )

        # 4. RRF fusion — fuse into candidate pool
        ranked_lists = [dense_results, sparse_results]
        candidate_k = self._rerank_candidates if self._reranker else top_k
        fused = _reciprocal_rank_fusion(ranked_lists, k=self._rrf_k)[:candidate_k]

        # 5. Cross-encoder reranking (optional)
        if self._reranker and fused:
            fused_docs = [doc for doc, _ in fused]
            reranked = await self._reranker.arerank(query.text, fused_docs, top_k)
            # Assign uniform normalized score; reranker ordering is what matters
            max_rrf = len(ranked_lists) / (self._rrf_k + 1)
            chunks = []
            scores = []
            for doc in reranked:
                raw = next((s for d, s in fused if d.get("id") == doc.get("id")), 0.0)
                chunks.append(Chunk(
                    id=doc.get("id", ""),
                    document_id=doc.get("metadata", {}).get("document_id", ""),
                    content=doc.get("content", ""),
                    metadata=doc.get("metadata", {}),
                ))
                scores.append(min(raw / max_rrf, 1.0))
            return RetrievalResult(chunks=chunks, scores=scores)

        # No reranker — normalize and return top_k
        # Normalize to [0, 1]: divide by theoretical max (top rank in every list)
        # max_rrf = num_lists / (k + 1)
        max_rrf = len(ranked_lists) / (self._rrf_k + 1)

        chunks = []
        scores = []
        for doc, raw_score in fused[:top_k]:
            chunks.append(Chunk(
                id=doc.get("id", ""),
                document_id=doc.get("metadata", {}).get("document_id", ""),
                content=doc.get("content", ""),
                metadata=doc.get("metadata", {}),
            ))
            scores.append(min(raw_score / max_rrf, 1.0))

        return RetrievalResult(chunks=chunks, scores=scores)


__all__ = ["HybridRetriever"]
