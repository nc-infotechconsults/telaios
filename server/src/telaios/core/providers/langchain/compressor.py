"""
src/core/providers/langchain/compressor.py
------------------------------------------
Contextual compression for retrieved documents.

Compresses each retrieved chunk to only the parts relevant to the query,
reducing context window usage and improving signal-to-noise ratio.

Sources:
- LangChain Contextual Compression:
  https://python.langchain.com/docs/how_to/contextual_compression/
- LLM Chain Filter:
  https://python.langchain.com/docs/integrations/document_transformers/llm_chain_filter/
"""

from __future__ import annotations

import logging
import re

from telaios.core.llm import LLM
from telaios.core.types import Chunk, Message, MessageRole, RetrievalQuery

logger = logging.getLogger(__name__)


class ContextualCompressor:
    """
    Compresses retrieved chunks by extracting only query-relevant content.

    Two strategies are supported:
    1. **LLM-based extraction**: Uses an LLM to extract relevant sentences.
    2. **Embedding-based filtering**: Uses embedding similarity at the sentence level.

    The compressor can be applied after any retrieval step to reduce context
    size before passing to the generation LLM.
    """

    def __init__(
        self,
        llm: LLM | None = None,
        max_sentences: int = 3,
        min_sentence_length: int = 20,
        strategy: str = "llm",
    ) -> None:
        self.llm = llm
        self.max_sentences = max_sentences
        self.min_sentence_length = min_sentence_length
        self.strategy = strategy

    def compress(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
    ) -> list[Chunk]:
        """
        Compress a list of chunks to query-relevant content.

        Args:
            query: The user's query.
            chunks: Retrieved chunks to compress.

        Returns:
            Compressed chunks with irrelevant content removed.
        """
        if not chunks:
            return []

        if self.strategy == "llm" and self.llm is not None:
            return self._compress_with_llm(query, chunks)
        elif self.strategy == "embedding":
            return self._compress_with_embedding(query, chunks)
        else:
            # Fallback: simple keyword-based sentence extraction
            return self._compress_with_keywords(query, chunks)

    async def acompress(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
    ) -> list[Chunk]:
        """Async version of compress."""
        return self.compress(query, chunks)

    def _compress_with_llm(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
    ) -> list[Chunk]:
        """Use an LLM to extract relevant sentences from each chunk."""
        import asyncio

        assert self.llm is not None

        compressed: list[Chunk] = []

        for chunk in chunks:
            sentences = self._split_sentences(chunk.content)
            if len(sentences) <= self.max_sentences:
                compressed.append(chunk)
                continue

            # Build a prompt asking the LLM to identify relevant sentences
            prompt = (
                f"Query: {query.text}\n\n"
                f"Document excerpt:\n{chunk.content}\n\n"
                f"Extract the {self.max_sentences} most relevant sentences "
                f"for answering the query. Return ONLY the relevant sentences, "
                f"one per line, with no extra text."
            )

            try:
                # Run sync LLM call (could be async in real implementation)
                loop = asyncio.new_event_loop()
                response = loop.run_until_complete(
                    self.llm.invoke([Message(role=MessageRole.HUMAN, content=prompt)])
                )
                extracted = response.content.strip()

                if extracted and len(extracted) >= self.min_sentence_length:
                    compressed.append(
                        Chunk(
                            id=chunk.id,
                            document_id=chunk.document_id,
                            content=extracted,
                            metadata={
                                **chunk.metadata,
                                "compressed": True,
                                "compression_method": "llm",
                            },
                        )
                    )
                else:
                    compressed.append(chunk)
            except Exception as exc:
                logger.warning("LLM compression failed for chunk %s: %s", chunk.id, exc)
                compressed.append(chunk)
            finally:
                loop.close()

        return compressed

    def _compress_with_embedding(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
    ) -> list[Chunk]:
        """
        Use embedding similarity to filter sentences.

        Placeholder implementation: uses simple keyword overlap.
        In production, compute embeddings for query and each sentence,
        then keep the top-N most similar sentences.
        """
        compressed: list[Chunk] = []
        query_words = set(query.text.lower().split())

        for chunk in chunks:
            sentences = self._split_sentences(chunk.content)
            if len(sentences) <= self.max_sentences:
                compressed.append(chunk)
                continue

            # Score each sentence by keyword overlap
            scored_sentences: list[tuple[str, float]] = []
            for sent in sentences:
                if len(sent) < self.min_sentence_length:
                    continue
                sent_words = set(sent.lower().split())
                overlap = len(query_words & sent_words)
                score = overlap / max(len(sent_words), 1)
                scored_sentences.append((sent, score))

            # Sort by score and take top-N
            scored_sentences.sort(key=lambda x: x[1], reverse=True)
            top_sentences = [s for s, _ in scored_sentences[: self.max_sentences]]
            top_sentences.sort(key=lambda s: chunk.content.index(s))  # preserve original order

            compressed.append(
                Chunk(
                    id=chunk.id,
                    document_id=chunk.document_id,
                    content=" ".join(top_sentences),
                    metadata={
                        **chunk.metadata,
                        "compressed": True,
                        "compression_method": "embedding",
                    },
                )
            )

        return compressed

    def _compress_with_keywords(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
    ) -> list[Chunk]:
        """Simple keyword-based sentence extraction."""
        compressed: list[Chunk] = []
        query_words = set(query.text.lower().split())

        for chunk in chunks:
            sentences = self._split_sentences(chunk.content)
            if len(sentences) <= self.max_sentences:
                compressed.append(chunk)
                continue

            scored: list[tuple[str, float]] = []
            for sent in sentences:
                if len(sent) < self.min_sentence_length:
                    continue
                sent_words = set(sent.lower().split())
                overlap = len(query_words & sent_words)
                # Also score by query term density
                density = overlap / max(len(sent.split()), 1)
                scored.append((sent, density))

            scored.sort(key=lambda x: x[1], reverse=True)
            top_sentences = [s for s, _ in scored[: self.max_sentences]]
            top_sentences.sort(key=lambda s: chunk.content.index(s))  # preserve order

            compressed.append(
                Chunk(
                    id=chunk.id,
                    document_id=chunk.document_id,
                    content=" ".join(top_sentences),
                    metadata={
                        **chunk.metadata,
                        "compressed": True,
                        "compression_method": "keyword",
                    },
                )
            )

        return compressed

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        """Split text into sentences using a simple regex."""
        # Simple sentence splitting: split on . ! ? followed by whitespace or end
        sentences = re.split(r"(?<=[.!?])\s+", text)
        return [s.strip() for s in sentences if s.strip()]


class LLMChainFilter:
    """
    Filter chunks using an LLM chain to determine relevance.

    Each chunk is scored independently for relevance to the query.
    Only chunks scoring above the threshold are kept.
    """

    RELEVANCE_PROMPT = """\
You are a relevance grader. Given a user query and a document excerpt,
determine if the excerpt contains information relevant to answering the query.

Query: {query}

Document excerpt:
{excerpt}

Is this excerpt relevant? Respond with ONLY one word:
- "yes" if relevant
- "no" if not relevant
- "partial" if partially relevant

Response:"""

    def __init__(
        self,
        llm: LLM,
        threshold: str = "yes",  # Keep chunks scoring >= this
    ) -> None:
        self.llm = llm
        self.threshold = threshold
        self._score_map = {"no": 0, "partial": 1, "yes": 2}
        self._threshold_score = self._score_map.get(threshold, 1)

    def filter_chunks(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
    ) -> list[Chunk]:
        """Filter chunks by LLM relevance grading."""
        import asyncio

        filtered: list[Chunk] = []

        for chunk in chunks:
            prompt = self.RELEVANCE_PROMPT.format(
                query=query.text,
                excerpt=chunk.content[:1000],  # Limit excerpt length
            )

            try:
                loop = asyncio.new_event_loop()
                response = loop.run_until_complete(
                    self.llm.invoke([Message(role=MessageRole.HUMAN, content=prompt)])
                )
                score_text = response.content.strip().lower()
                score = self._score_map.get(score_text, 0)

                if score >= self._threshold_score:
                    filtered.append(chunk)
                else:
                    logger.debug(
                        "LLMChainFilter: filtered out chunk %s (score=%s)",
                        chunk.id,
                        score_text,
                    )
            except Exception as exc:
                logger.warning("LLM filter failed for chunk %s: %s", chunk.id, exc)
                filtered.append(chunk)  # Keep on error
            finally:
                loop.close()

        return filtered

    async def afilter_chunks(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
    ) -> list[Chunk]:
        """Async version — processes chunks sequentially."""
        filtered: list[Chunk] = []

        for chunk in chunks:
            prompt = self.RELEVANCE_PROMPT.format(
                query=query.text,
                excerpt=chunk.content[:1000],
            )

            try:
                response = await self.llm.invoke([Message(role=MessageRole.HUMAN, content=prompt)])
                score_text = response.content.strip().lower()
                score = self._score_map.get(score_text, 0)

                if score >= self._threshold_score:
                    filtered.append(chunk)
                else:
                    logger.debug(
                        "LLMChainFilter (async): filtered out chunk %s (score=%s)",
                        chunk.id,
                        score_text,
                    )
            except Exception as exc:
                logger.warning("LLM filter failed for chunk %s: %s", chunk.id, exc)
                filtered.append(chunk)

        return filtered
