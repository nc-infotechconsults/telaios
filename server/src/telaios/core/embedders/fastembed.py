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
        import warnings

        from fastembed import TextEmbedding

        self._model_name = model
        with warnings.catch_warnings():
            # fastembed warns about pooling method change for e5 models; mean pooling
            # is correct and we use query_embed/passage_embed for proper prefixes.
            warnings.filterwarnings("ignore", message=".*mean pooling.*", category=UserWarning)
            self._model = TextEmbedding(model_name=model)
        self._dims = _DIMENSIONS.get(model, 1024)
        logger.info("FastEmbedEmbedder initialised: model=%r dims=%d", model, self._dims)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed document passages (uses ``passage_embed`` prefix for e5 models)."""
        loop = asyncio.get_running_loop()
        fn = partial(self._embed_passages_sync, texts)
        return await loop.run_in_executor(None, fn)

    async def embed_query(self, text: str) -> list[float]:
        """Embed a query string (uses ``query_embed`` prefix for e5 models)."""
        loop = asyncio.get_running_loop()
        fn = partial(self._embed_query_sync, text)
        return await loop.run_in_executor(None, fn)

    @property
    def dimensions(self) -> int:
        return self._dims

    def _embed_passages_sync(self, texts: list[str]) -> list[list[float]]:
        if hasattr(self._model, "passage_embed"):
            return [v.tolist() for v in self._model.passage_embed(texts)]
        return [v.tolist() for v in self._model.embed(texts)]

    def _embed_query_sync(self, text: str) -> list[float]:
        if hasattr(self._model, "query_embed"):
            return next(iter(self._model.query_embed([text]))).tolist()
        return next(iter(self._model.embed([text]))).tolist()


__all__ = ["FastEmbedEmbedder"]
