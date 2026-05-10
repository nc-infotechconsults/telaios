"""
src/core/providers/langchain/retriever_rerank.py
------------------------------------------------
Retriever wrapper that applies post-retrieval reranking.

Wraps any ``Retriever`` implementation and applies a ``Reranker`` to the
initial results, improving precision at the cost of additional latency.

Source: https://python.langchain.com/docs/integrations/document_transformers/cross_encoder_reranker/
"""

from __future__ import annotations

import logging

from telaios.core.rag import Retriever
from telaios.core.reranker import Reranker, RerankerConfig
from telaios.core.types import RetrievalQuery, RetrievalResult

logger = logging.getLogger(__name__)


class RerankingRetriever(Retriever):
    """
    Wraps a base ``Retriever`` and applies a ``Reranker`` to its results.

    Workflow:
        1. Base retriever fetches ``initial_top_k`` chunks.
        2. Reranker re-scores the chunks against the query.
        3. Return the top ``final_top_k`` chunks.

    This pattern improves precision for any retrieval backend without
    changing the underlying index or embedding model.

    Args:
        base_retriever: The underlying retriever to wrap.
        reranker: The reranker to apply to retrieved results.
        initial_top_k: How many chunks to fetch from the base retriever.
        final_top_k: How many chunks to return after reranking.
    """

    def __init__(
        self,
        base_retriever: Retriever,
        reranker: Reranker,
        initial_top_k: int = 20,
        final_top_k: int = 5,
    ) -> None:
        self.base_retriever = base_retriever
        self.reranker = reranker
        self.initial_top_k = initial_top_k
        self.final_top_k = final_top_k

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """
        Retrieve with reranking.

        1. Fetch ``initial_top_k`` from base retriever.
        2. Rerank and return ``final_top_k``.
        """
        # Step 1: Retrieve more than we need
        initial_query = RetrievalQuery(
            text=query.text,
            filters=query.filters,
            top_k=self.initial_top_k,
            min_score=query.min_score,
        )
        initial_results = self.base_retriever.retrieve(initial_query)

        if not initial_results.chunks:
            return initial_results

        # Step 2: Rerank
        reranked = self.reranker.rerank(
            query=query,
            chunks=initial_results.chunks,
            top_k=self.final_top_k,
        )

        logger.debug(
            "RerankingRetriever: %d → %d chunks (initial_top_k=%d, final_top_k=%d)",
            len(initial_results.chunks),
            len(reranked.chunks),
            self.initial_top_k,
            self.final_top_k,
        )

        return reranked

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Async retrieve with reranking."""
        # Step 1: Retrieve more than we need
        initial_query = RetrievalQuery(
            text=query.text,
            filters=query.filters,
            top_k=self.initial_top_k,
            min_score=query.min_score,
        )
        initial_results = await self.base_retriever.aretrieve(initial_query)

        if not initial_results.chunks:
            return initial_results

        # Step 2: Rerank
        reranked = await self.reranker.arerank(
            query=query,
            chunks=initial_results.chunks,
            top_k=self.final_top_k,
        )

        logger.debug(
            "RerankingRetriever (async): %d → %d chunks",
            len(initial_results.chunks),
            len(reranked.chunks),
        )

        return reranked


class RerankingRetrieverFactory:
    """Creates ``RerankingRetriever`` instances from configuration."""

    @staticmethod
    def create(
        base_retriever: Retriever,
        reranker_config: RerankerConfig,
        initial_top_k: int = 20,
        final_top_k: int = 5,
    ) -> RerankingRetriever:
        """
        Create a ``RerankingRetriever`` from a base retriever and reranker config.

        Args:
            base_retriever: The underlying retriever.
            reranker_config: Configuration for the reranker to use.
            initial_top_k: Number of chunks to fetch initially.
            final_top_k: Number of chunks to return after reranking.

        Returns:
            A ``RerankingRetriever`` instance.
        """
        reranker = _create_reranker_from_config(reranker_config)
        return RerankingRetriever(
            base_retriever=base_retriever,
            reranker=reranker,
            initial_top_k=initial_top_k,
            final_top_k=final_top_k,
        )


def _create_reranker_from_config(config: RerankerConfig) -> Reranker:
    """Factory: create a concrete reranker from config."""
    provider = config.provider.lower()

    if provider == "cross_encoder" or provider == "cross-encoder":
        from telaios.core.providers.cross_encoder.reranker import CrossEncoderReranker

        return CrossEncoderReranker(config=config)

    if provider == "voyage":
        from telaios.core.providers.voyage.reranker import VoyageReranker

        return VoyageReranker(
            api_key=config.api_key,
            model=config.model,
            config=config,
        )

    raise ValueError(
        f"Unknown reranker provider: {config.provider!r}. "
        "Supported: 'cross_encoder', 'voyage'."
    )
