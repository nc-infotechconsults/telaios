"""
src/agent_service/services/chunkers.py
--------------------------------------
Smart text chunking strategies.

Replaces the simple character-based chunker with strategies that respect
document structure:

- SemanticChunker    — Split by headings, paragraphs, sentences
- HierarchicalChunker — Multi-level: sections → paragraphs → sentences
- PageChunker        — Split by page boundaries
- TokenChunker       — Token-aware chunking (tiktoken)

Usage
~~~~~
    from agent_service.services.chunkers import SemanticChunker

    chunker = SemanticChunker(chunk_size=1000, overlap=100)
    chunks = chunker.chunk(markdown_text)
"""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Iterator

logger = logging.getLogger(__name__)


# ── Base ────────────────────────────────────────────────────────────────────────


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
        # Prefer sentence boundary for overlap
        overlap_text = chunk[-self.overlap:]
        last_period = overlap_text.rfind(".")
        if last_period > 0:
            return overlap_text[: last_period + 1].strip()
        return overlap_text.strip()


# ── SemanticChunker ───────────────────────────────────────────────────────────


class SemanticChunker(Chunker):
    """
    Split text at semantic boundaries: headings, paragraphs, sentences.

    Strategy:
        1. Identify heading boundaries (# Heading)
        2. Within each section, split at paragraph boundaries
        3. Within each paragraph, split at sentence boundaries
        4. If a chunk exceeds *chunk_size*, find the nearest sentence boundary

    This produces chunks that:
    - Start at a meaningful boundary (heading/paragraph)
    - End at a sentence boundary
    - Contain coherent, self-contained text
    """

    HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
    PARAGRAPH_RE = re.compile(r"\n\s*\n")

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        if not text or not text.strip():
            return []

        sections = self._split_by_headings(text)
        chunks: list[tuple[str, ChunkMetadata]] = []
        char_offset = 0
        chunk_index = 0

        for heading, level, section_text in sections:
            section_chunks = self._chunk_section(
                section_text, heading, level, char_offset, chunk_index
            )
            chunks.extend(section_chunks)

            if section_chunks:
                last_chunk, last_meta = section_chunks[-1]
                char_offset = last_meta.end_char
                chunk_index = last_meta.index + 1

        return chunks

    def _split_by_headings(self, text: str) -> list[tuple[str | None, int, str]]:
        """
        Split text by markdown headings.

        Returns list of (heading, level, text_between_headings).
        """
        matches = list(self.HEADING_RE.finditer(text))

        if not matches:
            # No headings — treat as single section
            return [(None, 0, text)]

        sections: list[tuple[str | None, int, str]] = []
        start = 0

        for m in matches:
            # Text before this heading
            if m.start() > start:
                pre_text = text[start : m.start()].strip()
                if pre_text:
                    sections.append((None, 0, pre_text))

            # Extract heading info
            level = len(m.group(1))
            heading = m.group(2).strip()
            start = m.end()

            # Find end of this section (start of next heading)
            next_match = None
            for m2 in matches:
                if m2.start() > m.start():
                    next_match = m2
                    break

            end = next_match.start() if next_match else len(text)
            section_text = text[m.start() : end].strip()
            sections.append((heading, level, section_text))

        return sections

    def _chunk_section(
        self,
        text: str,
        heading: str | None,
        level: int,
        char_offset: int,
        chunk_index: int,
    ) -> list[tuple[str, ChunkMetadata]]:
        """Chunk a single section into semantic chunks."""
        # Split into paragraphs
        paragraphs = self.PARAGRAPH_RE.split(text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        chunks: list[tuple[str, ChunkMetadata]] = []
        current_chunk = ""
        current_start = char_offset

        for para in paragraphs:
            if len(current_chunk) + len(para) + 1 <= self.chunk_size:
                if current_chunk:
                    current_chunk += "\n\n"
                current_chunk += para
            else:
                # Current chunk is full — emit it
                if current_chunk:
                    end = current_start + len(current_chunk)
                    chunks.append(
                        (
                            current_chunk,
                            ChunkMetadata(
                                index=chunk_index,
                                start_char=current_start,
                                end_char=end,
                                heading=heading,
                                level=level,
                            ),
                        )
                    )
                    chunk_index += 1

                # Start new chunk with overlap
                overlap = self._create_overlap(current_chunk)
                current_chunk = overlap + ("\n\n" if overlap else "") + para
                current_start = end - len(overlap) if overlap else end

        # Emit final chunk
        if current_chunk:
            end = current_start + len(current_chunk)
            chunks.append(
                (
                    current_chunk,
                    ChunkMetadata(
                        index=chunk_index,
                        start_char=current_start,
                        end_char=end,
                        heading=heading,
                        level=level,
                    ),
                )
            )

        return chunks


# ── HierarchicalChunker ──────────────────────────────────────────────────────


class HierarchicalChunker(Chunker):
    """
    Multi-level chunking: sections → paragraphs → sentences.

    Produces a hierarchy of chunks at different granularities:
    - Level 0: Full sections (between headings)
    - Level 1: Paragraphs
    - Level 2: Sentences (grouped into chunk_size)

    Useful when you want to retrieve at different levels of detail.
    """

    HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        """Return flat list of all chunk levels with metadata.level set."""
        if not text or not text.strip():
            return []

        all_chunks: list[tuple[str, ChunkMetadata]] = []
        char_offset = 0
        chunk_index = 0

        sections = self._split_by_headings(text)

        for heading, level, section_text in sections:
            section_chunks, char_offset, chunk_index = self._chunk_at_levels(
                section_text, heading, level, char_offset, chunk_index
            )
            all_chunks.extend(section_chunks)

        return all_chunks

    def _split_by_headings(self, text: str) -> list[tuple[str | None, int, str]]:
        """Split text by markdown headings."""
        matches = list(self.HEADING_RE.finditer(text))

        if not matches:
            return [(None, 0, text)]

        sections: list[tuple[str | None, int, str]] = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            level = len(m.group(1))
            heading = m.group(2).strip()
            sections.append((heading, level, text[start:end].strip()))

        return sections

    def _chunk_at_levels(
        self,
        text: str,
        heading: str | None,
        heading_level: int,
        char_offset: int,
        chunk_index: int,
    ) -> tuple[list[tuple[str, ChunkMetadata]], int, int]:
        """Chunk text at paragraph and sentence levels."""
        chunks: list[tuple[str, ChunkMetadata]] = []

        # Level 0: Section as a whole (if under chunk_size)
        if len(text) <= self.chunk_size:
            end = char_offset + len(text)
            chunks.append(
                (
                    text,
                    ChunkMetadata(
                        index=chunk_index,
                        start_char=char_offset,
                        end_char=end,
                        heading=heading,
                        level=0,
                    ),
                )
            )
            chunk_index += 1
            return chunks, end, chunk_index

        # Level 1: Paragraphs
        paragraphs = re.split(r"\n\s*\n", text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        for para in paragraphs:
            if len(para) <= self.chunk_size:
                end = char_offset + len(para)
                chunks.append(
                    (
                        para,
                        ChunkMetadata(
                            index=chunk_index,
                            start_char=char_offset,
                            end_char=end,
                            heading=heading,
                            level=1,
                        ),
                    )
                )
                chunk_index += 1
                char_offset = end
            else:
                # Level 2: Sentence-level chunking for long paragraphs
                sentence_chunks, char_offset, chunk_index = self._chunk_sentences(
                    para, heading, heading_level, char_offset, chunk_index
                )
                chunks.extend(sentence_chunks)

        return chunks, char_offset, chunk_index

    def _chunk_sentences(
        self,
        text: str,
        heading: str | None,
        heading_level: int,
        char_offset: int,
        chunk_index: int,
    ) -> tuple[list[tuple[str, ChunkMetadata]], int, int]:
        """Chunk text into sentence groups."""
        chunks: list[tuple[str, ChunkMetadata]] = []

        # Simple sentence splitting
        sentences = re.split(r"(?<=[.!?])\s+", text)
        sentences = [s.strip() for s in sentences if s.strip()]

        current_chunk = ""
        current_start = char_offset

        for sent in sentences:
            if len(current_chunk) + len(sent) + 1 <= self.chunk_size:
                if current_chunk:
                    current_chunk += " "
                current_chunk += sent
            else:
                # Emit current chunk
                if current_chunk:
                    end = current_start + len(current_chunk)
                    chunks.append(
                        (
                            current_chunk,
                            ChunkMetadata(
                                index=chunk_index,
                                start_char=current_start,
                                end_char=end,
                                heading=heading,
                                level=2,
                            ),
                        )
                    )
                    chunk_index += 1

                # Start new chunk with overlap
                overlap = self._create_overlap(current_chunk)
                current_chunk = overlap + (" " if overlap else "") + sent
                current_start = end - len(overlap) if overlap else end

        # Emit final chunk
        if current_chunk:
            end = current_start + len(current_chunk)
            chunks.append(
                (
                    current_chunk,
                    ChunkMetadata(
                        index=chunk_index,
                        start_char=current_start,
                        end_char=end,
                        heading=heading,
                        level=2,
                    ),
                )
            )
            chunk_index += 1

        return chunks, end, chunk_index


# ── PageChunker ─────────────────────────────────────────────────────────────


class PageChunker(Chunker):
    """
    Split text by page boundaries.

    Expects input with page markers (e.g., from PDF extraction):
        <!-- Page 1 -->
        Content of page 1

        <!-- Page 2 -->
        Content of page 2

    Each page becomes one or more chunks if it exceeds *chunk_size*.
    """

    PAGE_MARKER_RE = re.compile(r"<!--\s*Page\s*(\d+)\s*-->")

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        if not text or not text.strip():
            return []

        pages = self._split_by_pages(text)
        chunks: list[tuple[str, ChunkMetadata]] = []
        chunk_index = 0
        char_offset = 0

        for page_num, page_text in pages:
            page_chunks = self._chunk_page(
                page_text, page_num, char_offset, chunk_index
            )
            chunks.extend(page_chunks)

            if page_chunks:
                last_chunk, last_meta = page_chunks[-1]
                char_offset = last_meta.end_char
                chunk_index = last_meta.index + 1

        return chunks

    def _split_by_pages(self, text: str) -> list[tuple[int, str]]:
        """Split text by page markers."""
        matches = list(self.PAGE_MARKER_RE.finditer(text))

        if not matches:
            # No page markers — treat as single page
            return [(1, text)]

        pages: list[tuple[int, str]] = []
        for i, m in enumerate(matches):
            page_num = int(m.group(1))
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            page_text = text[start:end].strip()
            if page_text:
                pages.append((page_num, page_text))

        return pages

    def _chunk_page(
        self,
        text: str,
        page_num: int,
        char_offset: int,
        chunk_index: int,
    ) -> list[tuple[str, ChunkMetadata]]:
        """Chunk a single page, respecting chunk_size."""
        if len(text) <= self.chunk_size:
            end = char_offset + len(text)
            return [
                (
                    text,
                    ChunkMetadata(
                        index=chunk_index,
                        start_char=char_offset,
                        end_char=end,
                        page=page_num,
                    ),
                )
            ]

        # Split page into paragraphs
        paragraphs = re.split(r"\n\s*\n", text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        chunks: list[tuple[str, ChunkMetadata]] = []
        current_chunk = ""
        current_start = char_offset

        for para in paragraphs:
            if len(current_chunk) + len(para) + 2 <= self.chunk_size:
                if current_chunk:
                    current_chunk += "\n\n"
                current_chunk += para
            else:
                if current_chunk:
                    end = current_start + len(current_chunk)
                    chunks.append(
                        (
                            current_chunk,
                            ChunkMetadata(
                                index=chunk_index,
                                start_char=current_start,
                                end_char=end,
                                page=page_num,
                            ),
                        )
                    )
                    chunk_index += 1

                overlap = self._create_overlap(current_chunk)
                current_chunk = overlap + ("\n\n" if overlap else "") + para
                current_start = end - len(overlap) if overlap else end

        if current_chunk:
            end = current_start + len(current_chunk)
            chunks.append(
                (
                    current_chunk,
                    ChunkMetadata(
                        index=chunk_index,
                        start_char=current_start,
                        end_char=end,
                        page=page_num,
                    ),
                )
            )

        return chunks


# ── TokenChunker ──────────────────────────────────────────────────────────────


class TokenChunker(Chunker):
    """
    Token-aware chunking using tiktoken encoders.

    Splits text based on token count rather than character count,
    ensuring each chunk fits within the LLM's context window.

    Requires: ``pip install tiktoken``
    """

    DEFAULT_ENCODING = "cl100k_base"  # GPT-4, GPT-3.5-turbo

    def __init__(
        self,
        chunk_size: int = 500,
        overlap: int = 50,
        encoding: str = DEFAULT_ENCODING,
    ) -> None:
        super().__init__(chunk_size, overlap)
        self.encoding = encoding
        self._enc = None

    def _get_encoder(self) -> Any:
        """Lazy-load tiktoken encoder."""
        if self._enc is not None:
            return self._enc

        try:
            import tiktoken
        except ImportError as exc:
            raise ImportError(
                "tiktoken is required for TokenChunker. "
                "Install with: pip install tiktoken"
            ) from exc

        self._enc = tiktoken.get_encoding(self.encoding)
        return self._enc

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        if not text or not text.strip():
            return []

        enc = self._get_encoder()
        tokens = enc.encode(text)

        if len(tokens) <= self.chunk_size:
            return [
                (
                    text,
                    ChunkMetadata(
                        index=0,
                        start_char=0,
                        end_char=len(text),
                    ),
                )
            ]

        chunks: list[tuple[str, ChunkMetadata]] = []
        start = 0
        chunk_index = 0

        while start < len(tokens):
            end = min(start + self.chunk_size, len(tokens))

            # Decode this chunk back to text
            chunk_tokens = tokens[start:end]
            chunk_text = enc.decode(chunk_tokens)

            # Find character boundaries
            # We need to track original char positions
            prefix_tokens = tokens[:start]
            prefix_text = enc.decode(prefix_tokens)
            start_char = len(prefix_text)
            end_char = start_char + len(chunk_text)

            if chunk_text.strip():
                chunks.append(
                    (
                        chunk_text.strip(),
                        ChunkMetadata(
                            index=chunk_index,
                            start_char=start_char,
                            end_char=end_char,
                        ),
                    )
                )
                chunk_index += 1

            start += self.chunk_size - self.overlap
            if start >= len(tokens):
                break

        return chunks


# ── ChunkerFactory ────────────────────────────────────────────────────────────


class ChunkerFactory:
    """Factory for creating chunker instances by name."""

    _REGISTRY: dict[str, type[Chunker]] = {
        "semantic": SemanticChunker,
        "hierarchical": HierarchicalChunker,
        "page": PageChunker,
        "token": TokenChunker,
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


# ── Backward-compatible wrapper ───────────────────────────────────────────────


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
    strategy: str = "semantic",
) -> list[str]:
    """
    Split text into chunks using the specified strategy.

    Backward-compatible wrapper around the chunker classes.
    Returns plain chunk strings (no metadata).
    """
    chunker = ChunkerFactory.create(strategy, chunk_size=chunk_size, overlap=overlap)
    return [chunk for chunk, _ in chunker.chunk(text)]
