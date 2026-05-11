"""Semantic chunking strategy."""

from __future__ import annotations

import re

from telaios.tools.builtin.documents.chunking_base import Chunker, ChunkMetadata


class SemanticChunker(Chunker):
    """
    Split text at semantic boundaries: headings, paragraphs, sentences.

    Strategy:
        1. Identify heading boundaries (# Heading)
        2. Within each section, split at paragraph boundaries
        3. If a chunk exceeds *chunk_size*, find the nearest sentence boundary
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
        start = 0

        for m in matches:
            if m.start() > start:
                pre_text = text[start : m.start()].strip()
                if pre_text:
                    sections.append((None, 0, pre_text))

            level = len(m.group(1))
            heading = m.group(2).strip()
            start = m.end()

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
        paragraphs = self.PARAGRAPH_RE.split(text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        chunks: list[tuple[str, ChunkMetadata]] = []
        current_chunk = ""
        current_start = char_offset
        last_end = char_offset

        for para in paragraphs:
            if len(current_chunk) + len(para) + 1 <= self.chunk_size:
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
                                heading=heading,
                                level=level,
                            ),
                        )
                    )
                    chunk_index += 1
                    last_end = end

                overlap = self._create_overlap(current_chunk) if current_chunk else ""
                current_chunk = overlap + ("\n\n" if overlap else "") + para
                current_start = last_end - len(overlap) if overlap else last_end

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
