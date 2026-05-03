"""
src/core/providers/langchain/retriever_hyde.py
----------------------------------------------
HyDE (Hypothetical Document Embeddings) retriever.

Generates a hypothetical answer to the query using an LLM, embeds that answer,
and uses the hypothetical embedding for retrieval. This improves recall for
factual queries where the query wording differs from the document text.

Source: https://arxiv.org/abs/2212.10496
"""

from __future__ import annotations

import logging
from typing import Any

from core.llm import LLM
from core.rag import Retriever
from core.types import (
    Chunk,
    Message,
    MessageRole,
    RetrievalQuery,
    RetrievalResult,
)

logger = logging.getLogger(__name__)


class HyDERetriever(Retriever):
    """
    Retriever that uses HyDE (Hypothetical Document Embeddings) for retrieval.

    Algorithm:
        1. Generate a hypothetical answer to the query using an LLM.
        2. Embed the hypothetical answer (using the base retriever's embedding).
        3. Retrieve documents using the hypothetical embedding.
        4. Return the retrieved documents.

    This is especially effective for factual queries where the query phrasing
    differs from the document phrasing, because the LLM-generated hypothetical
    answer bridges the semantic gap.

    Args:
        base_retriever: The underlying retriever to use for actual document lookup.
        llm: The LLM to use for generating hypothetical answers.
        prompt_template: Optional custom prompt for generating hypothetical answers.
    """

    DEFAULT_PROMPT = """\
Given the following question, write a brief passage (2-3 sentences) that would
answer it. This passage will be used to find relevant documents, so write it
as if it were an excerpt from a relevant document.

Question: {query}

Passage:"""

    def __init__(
        self,
        base_retriever: Retriever,
        llm: LLM,
        prompt_template: str | None = None,
    ) -> None:
        self.base_retriever = base_retriever
        self.llm = llm
        self.prompt_template = prompt_template or self.DEFAULT_PROMPT

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """
        Retrieve using HyDE.

        1. Generate hypothetical answer.
        2. Use hypothetical answer as retrieval query.
        3. Return results from base retriever.
        """
        import asyncio

        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(self.aretrieve(query))
            return result
        finally:
            loop.close()

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Async HyDE retrieval."""
        # Step 1: Generate hypothetical document
        hypothetical = await self._generate_hypothetical(query.text)

        if not hypothetical:
            logger.warning("HyDE: failed to generate hypothetical answer, falling back")
            return await self.base_retriever.aretrieve(query)

        logger.debug(
            "HyDE: generated hypothetical (len=%d): %.100s...",
            len(hypothetical),
            hypothetical,
        )

        # Step 2: Retrieve using hypothetical answer as the query
        hyde_query = RetrievalQuery(
            text=hypothetical,
            filters=query.filters,
            top_k=query.top_k,
            min_score=query.min_score,
        )

        results = await self.base_retriever.aretrieve(hyde_query)

        # Step 3: Also retrieve with original query and merge
        original_results = await self.base_retriever.aretrieve(query)

        merged = self._merge_results(results, original_results, query.top_k)

        logger.debug(
            "HyDE: merged %d hyde + %d original = %d results",
            len(results.chunks),
            len(original_results.chunks),
            len(merged.chunks),
        )

        return merged

    async def _generate_hypothetical(self, query_text: str) -> str:
        """Generate a hypothetical answer using the LLM."""
        prompt = self.prompt_template.format(query=query_text)

        try:
            response = await self.llm.invoke(
                [Message(role=MessageRole.HUMAN, content=prompt)]
            )
            return response.content.strip()
        except Exception as exc:
            logger.error("HyDE: failed to generate hypothetical: %s", exc)
            return ""

    @staticmethod
    def _merge_results(
        hyde_results: RetrievalResult,
        original_results: RetrievalResult,
        top_k: int,
    ) -> RetrievalResult:
        """Merge HyDE and original query results, deduplicating by chunk ID."""
        seen: set[str] = set()
        merged_chunks: list[Chunk] = []
        merged_scores: list[float] = []

        # Prioritize HyDE results
        for chunk, score in zip(hyde_results.chunks, hyde_results.scores or []):
            if chunk.id not in seen:
                seen.add(chunk.id)
                merged_chunks.append(chunk)
                merged_scores.append(score)

        # Add original results
        for chunk, score in zip(original_results.chunks, original_results.scores or []):
            if chunk.id not in seen:
                seen.add(chunk.id)
                merged_chunks.append(chunk)
                merged_scores.append(score)

        # Truncate to top_k
        if len(merged_chunks) > top_k:
            merged_chunks = merged_chunks[:top_k]
            merged_scores = merged_scores[:top_k]

        return RetrievalResult(chunks=merged_chunks, scores=merged_scores)
