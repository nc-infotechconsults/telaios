"""HybridRetriever — Qdrant dense + BM25 sparse retrieval fused via RRF."""

from __future__ import annotations

import logging
from typing import Any

from telaios.core.retriever import Retriever
from telaios.core.types import Chunk, RetrievalQuery, RetrievalResult

logger = logging.getLogger(__name__)


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
    ) -> None:
        self._vs = vector_store
        self._bm25 = bm25_store
        self._collection = collection
        self._project_id = project_id
        self._hyde = hyde
        self._top_k = top_k
        self._rrf_k = rrf_k

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        import asyncio
        return asyncio.get_event_loop().run_until_complete(self.aretrieve(query))

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        top_k = query.top_k or self._top_k

        # 1. Embed query (via HyDE if enabled, else direct)
        if self._hyde is not None:
            vector = await self._hyde.embed_query(query.text, self._collection)
        else:
            vector = await self._vs.embed_query(query.text)

        # 2. Dense retrieval
        dense_results = await self._vs.search(
            collection=self._collection,
            vector=vector,
            project_id=self._project_id,
            top_k=top_k * 2,  # over-fetch for RRF
        )

        # 3. Sparse retrieval
        sparse_results = self._bm25.search(
            collection=self._collection,
            query=query.text,
            project_id=self._project_id,
            top_k=top_k * 2,
        )

        # 4. RRF fusion
        fused = _reciprocal_rank_fusion(
            [dense_results, sparse_results],
            k=self._rrf_k,
        )[:top_k]

        chunks = []
        scores = []
        for doc, score in fused:
            chunks.append(Chunk(
                id=doc.get("id", ""),
                document_id=doc.get("metadata", {}).get("document_id", ""),
                content=doc.get("content", ""),
                metadata=doc.get("metadata", {}),
            ))
            scores.append(score)

        return RetrievalResult(chunks=chunks, scores=scores)


__all__ = ["HybridRetriever"]
