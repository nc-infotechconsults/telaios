"""Shared base types for document chunking strategies."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ChunkMetadata:
    """Metadata for a text chunk."""

    index: int
    start_char: int
    end_char: int
    heading: str | None = None
    level: int = 0
    page: int | None = None


class Chunker(ABC):
    """Abstract base for all chunking strategies."""

    def __init__(self, chunk_size: int = 500, overlap: int = 50) -> None:
        self.chunk_size = chunk_size
        self.overlap = overlap

    @abstractmethod
    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        """Split *text* into chunks with metadata."""
        ...

    def _create_overlap(self, chunk: str) -> str:
        """Return overlap text from the end of a chunk."""
        if self.overlap <= 0:
            return ""
        overlap_text = chunk[-self.overlap :]
        last_period = overlap_text.rfind(".")
        if last_period > 0:
            return overlap_text[: last_period + 1].strip()
        return overlap_text.strip()
