"""
src/core/providers/langchain/retriever_stepback.py
--------------------------------------------------
Step-Back retriever.

Generates a higher-level "step-back" question from the original query,
retrieves for both the original and step-back questions, then combines
results. This improves recall for complex reasoning questions by including
broader context.

Source: https://arxiv.org/abs/2310.06117
"""

from __future__ import annotations

import logging

from telaios.core.llm import LLM
from telaios.core.rag import Retriever
from telaios.core.types import (
    Chunk,
    Message,
    MessageRole,
    RetrievalQuery,
    RetrievalResult,
)

logger = logging.getLogger(__name__)


class StepBackRetriever(Retriever):
    """
    Retriever that uses step-back prompting to broaden retrieval scope.

    Algorithm:
        1. Generate a higher-level "step-back" question from the original query.
        2. Retrieve documents for the step-back question.
        3. Retrieve documents for the original question.
        4. Combine and deduplicate results.

    The step-back question is more abstract/general than the original,
    helping to retrieve broader context that supports answering the
    specific question.

    Example:
        Original: "What temperature does langsmith set as a default?"
        Step-back: "What are the default temperature settings for common LLM frameworks?"

    Args:
        base_retriever: The underlying retriever to use.
        llm: The LLM to use for generating step-back questions.
        prompt_template: Optional custom prompt for step-back generation.
    """

    DEFAULT_PROMPT = """\
You are given a user question. Generate a more general "step-back" question
that would help find the broader context needed to answer the original.

The step-back question should be broader in scope but related to the topic.

Original question: {query}

Step-back question:"""

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
        Retrieve using step-back prompting.

        1. Generate step-back question.
        2. Retrieve for step-back question.
        3. Retrieve for original question.
        4. Combine and deduplicate.
        """
        import asyncio

        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(self.aretrieve(query))
            return result
        finally:
            loop.close()

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Async step-back retrieval."""
        # Step 1: Generate step-back question
        step_back = await self._generate_step_back(query.text)

        if not step_back:
            logger.warning("StepBack: failed to generate step-back, falling back")
            return await self.base_retriever.aretrieve(query)

        logger.debug(
            "StepBack: generated step-back: %.100s...",
            step_back,
        )

        # Step 2: Retrieve using step-back question
        stepback_query = RetrievalQuery(
            text=step_back,
            filters=query.filters,
            top_k=query.top_k,
            min_score=query.min_score,
        )
        stepback_results = await self.base_retriever.aretrieve(stepback_query)

        # Step 3: Retrieve using original question
        original_results = await self.base_retriever.aretrieve(query)

        # Step 4: Merge
        merged = self._merge_results(stepback_results, original_results, query.top_k)

        logger.debug(
            "StepBack: merged %d stepback + %d original = %d results",
            len(stepback_results.chunks),
            len(original_results.chunks),
            len(merged.chunks),
        )

        return merged

    async def _generate_step_back(self, query_text: str) -> str:
        """Generate a step-back question using the LLM."""
        prompt = self.prompt_template.format(query=query_text)

        try:
            response = await self.llm.invoke(
                [Message(role=MessageRole.HUMAN, content=prompt)]
            )
            return response.content.strip()
        except Exception as exc:
            logger.error("StepBack: failed to generate step-back: %s", exc)
            return ""

    @staticmethod
    def _merge_results(
        stepback_results: RetrievalResult,
        original_results: RetrievalResult,
        top_k: int,
    ) -> RetrievalResult:
        """Merge step-back and original results, deduplicating by chunk ID."""
        seen: set[str] = set()
        merged_chunks: list[Chunk] = []
        merged_scores: list[float] = []

        # Prioritize original results (more specific)
        for chunk, score in zip(original_results.chunks, original_results.scores or []):
            if chunk.id not in seen:
                seen.add(chunk.id)
                merged_chunks.append(chunk)
                merged_scores.append(score)

        # Add step-back results
        for chunk, score in zip(stepback_results.chunks, stepback_results.scores or []):
            if chunk.id not in seen:
                seen.add(chunk.id)
                merged_chunks.append(chunk)
                merged_scores.append(score)

        # Truncate to top_k
        if len(merged_chunks) > top_k:
            merged_chunks = merged_chunks[:top_k]
            merged_scores = merged_scores[:top_k]

        return RetrievalResult(chunks=merged_chunks, scores=merged_scores)
