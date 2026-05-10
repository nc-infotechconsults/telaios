"""Structural, token, and character chunking strategies."""

from __future__ import annotations

import re
from typing import Any

from telaios.tools.builtin.documents.chunking_base import Chunker, ChunkMetadata


class HierarchicalChunker(Chunker):
    """Multi-level chunking: sections to paragraphs to sentences."""

    HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        if not text or not text.strip():
            return []

        all_chunks: list[tuple[str, ChunkMetadata]] = []
        char_offset = 0
        chunk_index = 0

        for heading, level, section_text in self._split_by_headings(text):
            section_chunks, char_offset, chunk_index = self._chunk_at_levels(
                section_text, heading, level, char_offset, chunk_index
            )
            all_chunks.extend(section_chunks)

        return all_chunks

    def _split_by_headings(self, text: str) -> list[tuple[str | None, int, str]]:
        matches = list(self.HEADING_RE.finditer(text))
        if not matches:
            return [(None, 0, text)]

        sections: list[tuple[str | None, int, str]] = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            sections.append((m.group(2).strip(), len(m.group(1)), text[start:end].strip()))
        return sections

    def _chunk_at_levels(
        self,
        text: str,
        heading: str | None,
        heading_level: int,
        char_offset: int,
        chunk_index: int,
    ) -> tuple[list[tuple[str, ChunkMetadata]], int, int]:
        chunks: list[tuple[str, ChunkMetadata]] = []

        if len(text) <= self.chunk_size:
            end = char_offset + len(text)
            chunks.append(
                (text, ChunkMetadata(chunk_index, char_offset, end, heading, 0))
            )
            return chunks, end, chunk_index + 1

        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        for para in paragraphs:
            if len(para) <= self.chunk_size:
                end = char_offset + len(para)
                chunks.append(
                    (para, ChunkMetadata(chunk_index, char_offset, end, heading, 1))
                )
                chunk_index += 1
                char_offset = end
            else:
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
        chunks: list[tuple[str, ChunkMetadata]] = []
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        current_chunk = ""
        current_start = char_offset
        end = char_offset

        for sent in sentences:
            if len(current_chunk) + len(sent) + 1 <= self.chunk_size:
                current_chunk = f"{current_chunk} {sent}".strip()
            else:
                if current_chunk:
                    end = current_start + len(current_chunk)
                    chunks.append(
                        (
                            current_chunk,
                            ChunkMetadata(chunk_index, current_start, end, heading, 2),
                        )
                    )
                    chunk_index += 1

                overlap = self._create_overlap(current_chunk)
                current_chunk = overlap + (" " if overlap else "") + sent
                current_start = end - len(overlap) if overlap else end

        if current_chunk:
            end = current_start + len(current_chunk)
            chunks.append(
                (current_chunk, ChunkMetadata(chunk_index, current_start, end, heading, 2))
            )
            chunk_index += 1

        return chunks, end, chunk_index


class PageChunker(Chunker):
    """Split text by page boundary markers."""

    PAGE_MARKER_RE = re.compile(r"<!--\s*Page\s*(\d+)\s*-->")

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        if not text or not text.strip():
            return []

        chunks: list[tuple[str, ChunkMetadata]] = []
        chunk_index = 0
        char_offset = 0

        for page_num, page_text in self._split_by_pages(text):
            page_chunks = self._chunk_page(page_text, page_num, char_offset, chunk_index)
            chunks.extend(page_chunks)
            if page_chunks:
                _, last_meta = page_chunks[-1]
                char_offset = last_meta.end_char
                chunk_index = last_meta.index + 1

        return chunks

    def _split_by_pages(self, text: str) -> list[tuple[int, str]]:
        matches = list(self.PAGE_MARKER_RE.finditer(text))
        if not matches:
            return [(1, text)]

        pages: list[tuple[int, str]] = []
        for i, m in enumerate(matches):
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            page_text = text[start:end].strip()
            if page_text:
                pages.append((int(m.group(1)), page_text))
        return pages

    def _chunk_page(
        self,
        text: str,
        page_num: int,
        char_offset: int,
        chunk_index: int,
    ) -> list[tuple[str, ChunkMetadata]]:
        if len(text) <= self.chunk_size:
            end = char_offset + len(text)
            return [(text, ChunkMetadata(chunk_index, char_offset, end, page=page_num))]

        chunks: list[tuple[str, ChunkMetadata]] = []
        current_chunk = ""
        current_start = char_offset
        last_end = char_offset

        for para in [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]:
            if len(current_chunk) + len(para) + 2 <= self.chunk_size:
                current_chunk = current_chunk + ("\n\n" if current_chunk else "") + para
            else:
                if current_chunk:
                    end = current_start + len(current_chunk)
                    chunks.append(
                        (
                            current_chunk,
                            ChunkMetadata(chunk_index, current_start, end, page=page_num),
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
                (current_chunk, ChunkMetadata(chunk_index, current_start, end, page=page_num))
            )

        return chunks


class TokenChunker(Chunker):
    """Token-aware chunking using tiktoken encoders."""

    DEFAULT_ENCODING = "cl100k_base"

    def __init__(
        self,
        chunk_size: int = 500,
        overlap: int = 50,
        encoding: str = DEFAULT_ENCODING,
    ) -> None:
        super().__init__(chunk_size, overlap)
        self.encoding = encoding
        self._enc: Any | None = None

    def _get_encoder(self) -> Any:
        if self._enc is not None:
            return self._enc
        try:
            import tiktoken
        except ImportError as exc:
            raise ImportError("tiktoken is required for TokenChunker.") from exc
        self._enc = tiktoken.get_encoding(self.encoding)
        return self._enc

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        if not text or not text.strip():
            return []

        enc = self._get_encoder()
        tokens = enc.encode(text)
        if len(tokens) <= self.chunk_size:
            return [(text, ChunkMetadata(0, 0, len(text)))]

        chunks: list[tuple[str, ChunkMetadata]] = []
        start = 0
        chunk_index = 0
        while start < len(tokens):
            end = min(start + self.chunk_size, len(tokens))
            chunk_text = enc.decode(tokens[start:end])
            start_char = len(enc.decode(tokens[:start]))
            end_char = start_char + len(chunk_text)
            if chunk_text.strip():
                chunks.append(
                    (
                        chunk_text.strip(),
                        ChunkMetadata(chunk_index, start_char, end_char),
                    )
                )
                chunk_index += 1
            start += self.chunk_size - self.overlap
            if start >= len(tokens):
                break
        return chunks


class CharacterChunker(Chunker):
    """Simple character-based chunking with overlap."""

    def chunk(self, text: str) -> list[tuple[str, ChunkMetadata]]:
        if not text or not text.strip():
            return []

        chunks: list[tuple[str, ChunkMetadata]] = []
        start = 0
        chunk_index = 0

        while start < len(text):
            end = min(start + self.chunk_size, len(text))
            chunk = text[start:end].strip()
            if chunk:
                chunks.append((chunk, ChunkMetadata(chunk_index, start, end)))
                chunk_index += 1
            start += self.chunk_size - self.overlap
            if start >= len(text):
                break

        return chunks
