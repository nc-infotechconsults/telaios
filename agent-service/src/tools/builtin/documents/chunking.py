"""
tools/builtin/documents/chunking.py
------------------------------------
Public document chunking API.

Strategy implementations live in smaller sibling modules so each file stays
within the migration size budget.
"""

from __future__ import annotations

from typing import Any

from core.types import Chunk, ChunkingConfig, Document
from tools.builtin.documents.chunking_base import Chunker, ChunkMetadata
from tools.builtin.documents.chunking_semantic import SemanticChunker
from tools.builtin.documents.chunking_structural import (
    CharacterChunker,
    HierarchicalChunker,
    PageChunker,
    TokenChunker,
)


class ChunkerFactory:
    """Factory for creating chunker instances by name."""

    _REGISTRY: dict[str, type[Chunker]] = {
        "semantic": SemanticChunker,
        "hierarchical": HierarchicalChunker,
        "page": PageChunker,
        "token": TokenChunker,
        "character": CharacterChunker,
    }

    @classmethod
    def create(cls, strategy: str, **kwargs: Any) -> Chunker:
        """Create a chunker by strategy name."""
        chunker_cls = cls._REGISTRY.get(strategy.lower())
        if chunker_cls is None:
            raise ValueError(
                f"Unknown chunking strategy: {strategy!r}. "
                f"Available: {list(cls._REGISTRY)}"
            )
        return chunker_cls(**kwargs)

    @classmethod
    def available_strategies(cls) -> list[str]:
        """Return list of available chunking strategies."""
        return list(cls._REGISTRY.keys())


def chunk_document(
    document: Document,
    config: ChunkingConfig = ChunkingConfig(),
) -> list[Chunk]:
    """
    Split a document into ``Chunk`` objects based on the configured strategy.

    Returns chunks with ``document_id`` and ``metadata`` populated.
    """
    chunker = ChunkerFactory.create(
        config.strategy,
        chunk_size=config.chunk_size,
        overlap=config.chunk_overlap,
    )
    raw_chunks = chunker.chunk(document.content)

    result: list[Chunk] = []
    for i, (text, meta) in enumerate(raw_chunks):
        if config.max_chunks and i >= config.max_chunks:
            break
        result.append(
            Chunk(
                id=f"{document.id}:chunk:{meta.index}",
                document_id=document.id,
                content=text,
                metadata={
                    "index": meta.index,
                    "start_char": meta.start_char,
                    "end_char": meta.end_char,
                    "heading": meta.heading,
                    "level": meta.level,
                    "page": meta.page,
                },
            )
        )
    return result


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
    strategy: str = "character",
) -> list[str]:
    """
    Split text into plain chunk strings (no metadata).

    Backward-compatible wrapper. Defaults to ``"character"`` strategy.
    """
    chunker = ChunkerFactory.create(strategy, chunk_size=chunk_size, overlap=overlap)
    return [chunk for chunk, _ in chunker.chunk(text)]


__all__ = [
    "CharacterChunker",
    "Chunker",
    "ChunkerFactory",
    "ChunkMetadata",
    "HierarchicalChunker",
    "PageChunker",
    "SemanticChunker",
    "TokenChunker",
    "chunk_document",
    "chunk_text",
]
