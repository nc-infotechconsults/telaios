"""FastEmbedEmbedder — in-process CPU embedding via fastembed.

No server required. Model weights downloaded to ``~/.cache/fastembed/`` on
first use and reused from disk afterwards.

Source: https://qdrant.github.io/fastembed/
"""

from __future__ import annotations

import asyncio
import logging
from functools import partial

from telaios.core.embedders.base import Embedder

logger = logging.getLogger(__name__)

_DIMENSIONS: dict[str, int] = {
    # English
    "BAAI/bge-small-en-v1.5": 384,
    "BAAI/bge-base-en-v1.5": 768,
    "BAAI/bge-large-en-v1.5": 1024,
    "sentence-transformers/all-MiniLM-L6-v2": 384,
    # Multilingual
    "BAAI/bge-m3": 1024,
    "intfloat/multilingual-e5-large": 1024,
    "sentence-transformers/paraphrase-multilingual-mpnet-base-v2": 768,
}


class FastEmbedEmbedder(Embedder):
    """Wraps fastembed.TextEmbedding with a fully async interface.

    fastembed's ``embed()`` is a synchronous generator, so calls are offloaded
    to the default thread-pool executor to avoid blocking the event loop.
    """

    def __init__(self, model: str = "intfloat/multilingual-e5-large") -> None:
        from fastembed import TextEmbedding

        self._model_name = model
        self._model = TextEmbedding(model_name=model)
        self._dims = _DIMENSIONS.get(model, 1024)
        logger.info("FastEmbedEmbedder initialised: model=%r dims=%d", model, self._dims)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        loop = asyncio.get_running_loop()
        fn = partial(self._embed_sync, texts)
        return await loop.run_in_executor(None, fn)

    async def embed_query(self, text: str) -> list[float]:
        results = await self.embed([text])
        return results[0]

    @property
    def dimensions(self) -> int:
        return self._dims

    def _embed_sync(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self._model.embed(texts)]


__all__ = ["FastEmbedEmbedder"]
