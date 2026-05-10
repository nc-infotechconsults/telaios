"""
src/core/reranker.py
--------------------
Abstract interface for document reranking.

Rerankers take an initial set of retrieved documents and re-score them
for higher precision using cross-encoders or API-based rerankers.

Sources
~~~~~~~
- LangChain Cross-Encoder:
  https://python.langchain.com/docs/integrations/document_transformers/cross_encoder_reranker/
- Cohere Rerank API: https://docs.cohere.com/docs/rerank-2
- Voyage AI Rerank: https://docs.voyageai.com/docs/reranker
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from telaios.core.types import Chunk, RetrievalQuery, RetrievalResult


class Reranker(ABC):
    """
    Framework-agnostic interface for document reranking.

    Rerankers improve the precision of an initial retrieval pass by
    re-scoring documents using a more expensive but accurate method
    (cross-encoder, LLM, or API-based).

    Callers use rerankers to wrap any ``Retriever`` implementation,
    applying post-processing to improve result quality.
    """

    @abstractmethod
    def rerank(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
        top_k: int | None = None,
    ) -> RetrievalResult:
        """
        Re-score and reorder chunks based on the query.

        Args:
            query: The original retrieval query.
            chunks: The initial retrieved chunks to rerank.
            top_k: Maximum number of results to return (None = keep all).

        Returns:
            ``RetrievalResult`` with re-ordered chunks and relevance scores.
        """
        ...

    @abstractmethod
    async def arerank(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
        top_k: int | None = None,
    ) -> RetrievalResult:
        """
        Async version of rerank.

        Args:
            query: The original retrieval query.
            chunks: The initial retrieved chunks to rerank.
            top_k: Maximum number of results to return.

        Returns:
            ``RetrievalResult`` with re-ordered chunks and relevance scores.
        """
        ...