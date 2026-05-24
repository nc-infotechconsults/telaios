"""Chunker ABC and ChunkMetadata — shared base for all chunking strategies."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ChunkMetadata:
    """Metadata for a text chunk."""

    index: int
    start_char: int
    end_char: int

    # Document-level
    heading: str | None = None
    level: int = 0
    page: int | None = None

    # Code-level (populated by ASTChunker)
    symbol_name: str | None = None
    symbol_type: str | None = None  # "function" | "class" | "module" | "preamble"
    enclosing_class: str | None = None  # class name when chunk is a method/field
    start_line: int | None = None
    end_line: int | None = None
    language: str | None = None

    extra: dict = field(default_factory=dict)


class Chunker(ABC):
    """Abstract base for all chunking strategies."""

    def __init__(self, chunk_size: int = 512, overlap: int = 64) -> None:
        self.chunk_size = chunk_size
        self.overlap = overlap

    @abstractmethod
    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        """Split *text* into (content, metadata) pairs."""
        ...

    def _create_overlap(self, chunk: str) -> str:
        if self.overlap <= 0:
            return ""
        overlap_text = chunk[-self.overlap:]
        last_period = overlap_text.rfind(".")
        if last_period > 0:
            return overlap_text[: last_period + 1].strip()
        return overlap_text.strip()


__all__ = ["Chunker", "ChunkMetadata"]
