"""
src/core/providers/voyage/reranker.py
-------------------------------------
Voyage AI API reranker.

Source: https://docs.voyageai.com/docs/reranker
"""

from __future__ import annotations

import logging
from typing import Any

from core.reranker import Reranker, RerankerConfig
from core.types import Chunk, RetrievalQuery, RetrievalResult

logger = logging.getLogger(__name__)


class VoyageReranker(Reranker):
    """
    Reranker using the Voyage AI reranking API.

    Voyage AI provides high-quality reranking models that can be accessed
    via their REST API. This is useful when you want cloud-grade reranking
    without managing local models.
    """

    DEFAULT_MODEL = "rerank-2"
    API_BASE = "https://api.voyageai.com/v1"

    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_MODEL,
        config: RerankerConfig | None = None,
    ) -> None:
        self.api_key = api_key or (config.api_key if config else "")
        self.model = model or (config.model if config else self.DEFAULT_MODEL)
        self.base_url = (config.base_url if config else None) or self.API_BASE

    def rerank(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
        top_k: int | None = None,
    ) -> RetrievalResult:
        """Re-score chunks using the Voyage AI API."""
        if not chunks:
            return RetrievalResult(chunks=[], scores=[])

        import httpx

        documents = [chunk.content for chunk in chunks]
        k = top_k or len(chunks)

        response = httpx.post(
            f"{self.base_url}/rerank",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "query": query.text,
                "documents": documents,
                "top_k": k,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()

        # Map results back to chunks
        results = data.get("results", [])
        result_chunks: list[Chunk] = []
        result_scores: list[float] = []

        for r in results:
            idx = r.get("index", 0)
            score = r.get("relevance_score", 0.0)
            if 0 <= idx < len(chunks):
                result_chunks.append(chunks[idx])
                result_scores.append(score)

        return RetrievalResult(chunks=result_chunks, scores=result_scores)

    async def arerank(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
        top_k: int | None = None,
    ) -> RetrievalResult:
        """Async version using httpx.AsyncClient."""
        if not chunks:
            return RetrievalResult(chunks=[], scores=[])

        import httpx

        documents = [chunk.content for chunk in chunks]
        k = top_k or len(chunks)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/rerank",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "query": query.text,
                    "documents": documents,
                    "top_k": k,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

        results = data.get("results", [])
        result_chunks: list[Chunk] = []
        result_scores: list[float] = []

        for r in results:
            idx = r.get("index", 0)
            score = r.get("relevance_score", 0.0)
            if 0 <= idx < len(chunks):
                result_chunks.append(chunks[idx])
                result_scores.append(score)

        return RetrievalResult(chunks=result_chunks, scores=result_scores)


def create_voyage_reranker(config: RerankerConfig) -> VoyageReranker:
    """Factory function for VoyageReranker from config."""
    return VoyageReranker(
        api_key=config.api_key,
        model=config.model,
        config=config,
    )
