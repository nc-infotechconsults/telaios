"""
src/core/providers/cross_encoder/reranker.py
-------------------------------------------
Local cross-encoder reranker using sentence-transformers.

Source: https://python.langchain.com/docs/integrations/document_transformers/cross_encoder_reranker/
"""

from __future__ import annotations

import logging
from typing import Any

from telaios.core.reranker import Reranker, RerankerConfig
from telaios.core.types import Chunk, RetrievalQuery, RetrievalResult

logger = logging.getLogger(__name__)


class CrossEncoderReranker(Reranker):
    """
    Reranker using a local ``sentence-transformers`` cross-encoder model.

    Cross-encoders score query-document pairs jointly, providing higher
    precision than bi-encoder (embedding) retrieval at the cost of
    O(n) inference time where *n* is the number of candidate documents.

    The model is loaded lazily on first use and cached for subsequent calls.
    """

    DEFAULT_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    def __init__(
        self,
        model_name: str | None = None,
        device: str | None = None,
        max_length: int = 512,
        batch_size: int = 32,
        config: RerankerConfig | None = None,
    ) -> None:
        self.model_name = model_name or (config.model if config else self.DEFAULT_MODEL)
        self.device = device or "cpu"
        self.max_length = max_length
        self.batch_size = batch_size
        self._model: Any | None = None

    def _load_model(self) -> Any:
        """Lazy-load the cross-encoder model."""
        if self._model is not None:
            return self._model

        try:
            from sentence_transformers import CrossEncoder
        except ImportError as exc:
            raise ImportError(
                "sentence-transformers is required for CrossEncoderReranker. "
                "Install with: pip install sentence-transformers"
            ) from exc

        logger.info("Loading cross-encoder model: %s", self.model_name)
        self._model = CrossEncoder(
            self.model_name,
            device=self.device,
            max_length=self.max_length,
        )
        return self._model

    def rerank(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
        top_k: int | None = None,
    ) -> RetrievalResult:
        """Re-score chunks using the cross-encoder."""
        if not chunks:
            return RetrievalResult(chunks=[], scores=[])

        model = self._load_model()

        # Prepare query-document pairs
        pairs = [(query.text, chunk.content) for chunk in chunks]

        # Score in batches
        scores = model.predict(
            pairs,
            batch_size=self.batch_size,
            show_progress_bar=False,
        )

        # Sort by score (descending)
        scored = list(zip(chunks, scores))
        scored.sort(key=lambda x: x[1], reverse=True)

        # Apply top_k limit
        if top_k is not None:
            scored = scored[:top_k]

        result_chunks = [chunk for chunk, _ in scored]
        result_scores = [float(score) for _, score in scored]

        return RetrievalResult(chunks=result_chunks, scores=result_scores)

    async def arerank(
        self,
        query: RetrievalQuery,
        chunks: list[Chunk],
        top_k: int | None = None,
    ) -> RetrievalResult:
        """Async wrapper — runs sync rerank in executor."""
        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self.rerank,
            query,
            chunks,
            top_k,
        )


def create_cross_encoder_reranker(config: RerankerConfig) -> CrossEncoderReranker:
    """Factory function for CrossEncoderReranker from config."""
    return CrossEncoderReranker(
        model_name=config.model,
        config=config,
    )
