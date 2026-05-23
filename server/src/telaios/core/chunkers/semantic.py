"""Semantic chunking strategy — heading + paragraph boundary aware."""

from __future__ import annotations

import re

from telaios.core.chunkers.base import Chunker, ChunkMetadata


class SemanticChunker(Chunker):
    """
    Split text at semantic boundaries: headings → paragraphs → sentences.

    Strategy:
      1. Split at Markdown headings (# Heading)
      2. Within each section, split at paragraph boundaries
      3. If a chunk exceeds chunk_size, fall back to nearest sentence boundary
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
                _, last_meta = section_chunks[-1]
                char_offset = last_meta.end_char
                chunk_index = last_meta.index + 1

        return chunks

    def _split_by_headings(self, text: str) -> list[tuple[str | None, int, str]]:
        matches = list(self.HEADING_RE.finditer(text))
        if not matches:
            return [(None, 0, text)]

        sections: list[tuple[str | None, int, str]] = []

        for i, m in enumerate(matches):
            # Prepend any preamble before first heading
            if i == 0 and m.start() > 0:
                pre = text[: m.start()].strip()
                if pre:
                    sections.append((None, 0, pre))

            level = len(m.group(1))
            heading = m.group(2).strip()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
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
        paragraphs = [p.strip() for p in self.PARAGRAPH_RE.split(text) if p.strip()]
        chunks: list[tuple[str, ChunkMetadata]] = []
        current_chunk = ""
        current_start = char_offset
        last_end = char_offset

        for para in paragraphs:
            if len(current_chunk) + len(para) + 1 <= self.chunk_size:
                current_chunk = (current_chunk + "\n\n" + para).lstrip() if current_chunk else para
            else:
                if current_chunk:
                    end = current_start + len(current_chunk)
                    chunks.append((
                        current_chunk,
                        ChunkMetadata(
                            index=chunk_index,
                            start_char=current_start,
                            end_char=end,
                            heading=heading,
                            level=level,
                        ),
                    ))
                    chunk_index += 1
                    last_end = end

                overlap = self._create_overlap(current_chunk) if current_chunk else ""
                current_chunk = (overlap + "\n\n" + para).lstrip() if overlap else para
                current_start = last_end - len(overlap) if overlap else last_end

        if current_chunk:
            end = current_start + len(current_chunk)
            chunks.append((
                current_chunk,
                ChunkMetadata(
                    index=chunk_index,
                    start_char=current_start,
                    end_char=end,
                    heading=heading,
                    level=level,
                ),
            ))

        return chunks


__all__ = ["SemanticChunker"]
