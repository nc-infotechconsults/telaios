"""core.embedders — pluggable text embedding providers."""

from __future__ import annotations

import logging

from telaios.core.embedders.base import Embedder
from telaios.core.embedders.fastembed import FastEmbedEmbedder
from telaios.core.embedders.tei import TEIEmbedder

logger = logging.getLogger(__name__)


class EmbedderFactory:
    """Build an ``Embedder`` from ``KnowledgePipelineConfig.embedding``.

    Provider routing:
      ``fastembed`` (default) → FastEmbedEmbedder — in-process, no server
      ``tei``                 → TEIEmbedder       — HuggingFace TEI HTTP server
    """

    @staticmethod
    def create(config: object) -> Embedder:  # config: EmbeddingConfig
        from telaios.core.knowledge.config import EmbeddingConfig

        assert isinstance(config, EmbeddingConfig)

        match config.provider.lower():
            case "tei":
                if not config.base_url:
                    raise ValueError(
                        "EMBEDDING_BASE_URL required for provider=tei "
                        "(e.g. http://localhost:8080)"
                    )
                return TEIEmbedder(
                    base_url=config.base_url,
                    model=config.model,
                    dimensions=config.dimensions or 1024,
                    api_key=config.api_key or None,
                )
            case _:
                # fastembed / empty / unknown → default in-process
                if config.provider not in ("fastembed", ""):
                    logger.warning(
                        "Unknown EMBEDDING_PROVIDER=%r, falling back to fastembed",
                        config.provider,
                    )
                return FastEmbedEmbedder(model=config.model)


__all__ = ["Embedder", "EmbedderFactory", "FastEmbedEmbedder", "TEIEmbedder"]
