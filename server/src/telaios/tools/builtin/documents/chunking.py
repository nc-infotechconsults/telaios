"""tools/builtin/documents/chunking.py — Public document chunking API.

Delegates to the canonical chunkers in ``core.chunkers``.
"""

from __future__ import annotations

from typing import Any, ClassVar

from telaios.core.chunkers import ASTChunker, Chunker, ChunkMetadata, SemanticChunker
from telaios.core.types import Chunk, ChunkingConfig, Document


class ChunkerFactory:
    """Factory for creating chunker instances by name."""

    _REGISTRY: ClassVar[dict[str, type[Chunker]]] = {
        "semantic": SemanticChunker,
        "ast": ASTChunker,
    }

    @classmethod
    def create(cls, strategy: str, **kwargs: Any) -> Chunker:
        chunker_cls = cls._REGISTRY.get(strategy.lower())
        if chunker_cls is None:
            raise ValueError(
                f"Unknown chunking strategy: {strategy!r}. Available: {list(cls._REGISTRY)}"
            )
        return chunker_cls(**kwargs)

    @classmethod
    def available_strategies(cls) -> list[str]:
        return list(cls._REGISTRY.keys())


def chunk_document(
    document: Document,
    config: ChunkingConfig = ChunkingConfig(),
) -> list[Chunk]:
    """Split a document into Chunk objects based on the configured strategy."""
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
                    "symbol_name": meta.symbol_name,
                    "symbol_type": meta.symbol_type,
                    "start_line": meta.start_line,
                    "end_line": meta.end_line,
                    "language": meta.language,
                },
            )
        )
    return result


def chunk_text(
    text: str,
    chunk_size: int = 512,
    overlap: int = 64,
    strategy: str = "semantic",
) -> list[str]:
    """Split text into plain chunk strings (no metadata)."""
    chunker = ChunkerFactory.create(strategy, chunk_size=chunk_size, overlap=overlap)
    return [chunk for chunk, _ in chunker.chunk(text)]


__all__ = [
    "ASTChunker",
    "ChunkMetadata",
    "Chunker",
    "ChunkerFactory",
    "SemanticChunker",
    "chunk_document",
    "chunk_text",
]
