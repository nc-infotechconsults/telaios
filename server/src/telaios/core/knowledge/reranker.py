"""CrossEncoderReranker — post-retrieval reranking via fastembed cross-encoder.

Reranking runs AFTER RRF fusion on the over-fetched candidate pool and before
the LLM generation step. It significantly improves precision@k by scoring
(query, chunk) pairs jointly rather than independently.

Source: https://qdrant.github.io/fastembed/examples/Reranking/
Default model: BAAI/bge-reranker-v2-m3 (lightweight, multilingual, strong quality)
"""

from __future__ import annotations

import asyncio
import logging
from functools import partial
from typing import Any

logger = logging.getLogger(__name__)


class CrossEncoderReranker:
    """Wraps fastembed TextCrossEncoder with an async interface."""

    def __init__(self, model: str = "BAAI/bge-reranker-v2-m3") -> None:
        try:
            from fastembed.rerank.cross_encoder import TextCrossEncoder
        except ImportError as exc:
            raise ImportError(
                "fastembed reranker not available. Ensure fastembed>=0.4 is installed."
            ) from exc
        self._model_name = model
        self._model = TextCrossEncoder(model_name=model)
        logger.info("CrossEncoderReranker initialised: model=%r", model)

    def rerank(
        self,
        query: str,
        docs: list[dict[str, Any]],
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Score (query, content) pairs and return top_k docs, highest score first."""
        if not docs:
            return []
        contents = [d.get("content", "") for d in docs]
        scores = list(self._model.rerank(query, contents))
        ranked = sorted(zip(scores, docs), key=lambda x: x[0], reverse=True)
        return [doc for _, doc in ranked[:top_k]]

    async def arerank(
        self,
        query: str,
        docs: list[dict[str, Any]],
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Async wrapper — offloads CPU-bound reranking to thread pool."""
        loop = asyncio.get_running_loop()
        fn = partial(self.rerank, query, docs, top_k)
        return await loop.run_in_executor(None, fn)


__all__ = ["CrossEncoderReranker"]
