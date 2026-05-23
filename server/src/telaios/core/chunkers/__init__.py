"""Text chunking strategies for documents and code."""

from __future__ import annotations

from pathlib import Path

from telaios.core.chunkers.ast import ASTChunker
from telaios.core.chunkers.base import Chunker, ChunkMetadata
from telaios.core.chunkers.semantic import SemanticChunker
from telaios.core.chunkers.treesitter import EXTENSION_TO_LANGUAGE, TreeSitterChunker


def get_code_chunker(
    source_path: str | Path | None = None,
    language: str | None = None,
    max_lines: int = 100,
    chunk_size: int = 512,
    overlap: int = 64,
) -> Chunker:
    """
    Return the best chunker for a source file.

    Prefers TreeSitterChunker when the language is supported. Falls back to
    ASTChunker (Python-only) and then to SemanticChunker for unknown languages.
    """
    lang = language or (
        TreeSitterChunker.detect_language(source_path) if source_path else None
    )
    if lang and lang in EXTENSION_TO_LANGUAGE.values():
        try:
            return TreeSitterChunker(language=lang, max_lines=max_lines, chunk_size=chunk_size, overlap=overlap)
        except ImportError:
            pass  # tree-sitter optional — fall through
    if lang == "python":
        return ASTChunker(chunk_size=chunk_size, language="python", max_lines=max_lines)
    return SemanticChunker(chunk_size=chunk_size, overlap=overlap)


__all__ = [
    "ASTChunker",
    "Chunker",
    "ChunkMetadata",
    "SemanticChunker",
    "TreeSitterChunker",
    "EXTENSION_TO_LANGUAGE",
    "get_code_chunker",
]
