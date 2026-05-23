"""Embedder ABC — provider-agnostic text embedding interface."""

from __future__ import annotations

from abc import ABC, abstractmethod


class Embedder(ABC):
    """Async interface for text embedding providers.

    Implementations:
      - ``FastEmbedEmbedder``  — fastembed, in-process CPU, no server required
      - ``TEIEmbedder``        — Hugging Face Text Embeddings Inference HTTP server
    """

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts. Returns one vector per input text."""
        ...

    @abstractmethod
    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query string."""
        ...

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Output vector dimensionality."""
        ...


__all__ = ["Embedder"]
