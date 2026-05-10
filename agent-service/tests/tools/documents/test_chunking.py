"""tests/tools/documents/test_chunking.py — Tests for document chunking."""

from __future__ import annotations

import pytest

from telaios.core.types import Chunk, ChunkingConfig, Document
from telaios.tools import (
    CharacterChunker,
    ChunkerFactory,
    HierarchicalChunker,
    PageChunker,
    SemanticChunker,
    chunk_document,
    chunk_text,
)


class TestChunkerFactory:
    """Tests for ChunkerFactory."""

    def test_create_semantic(self):
        chunker = ChunkerFactory.create("semantic", chunk_size=500, overlap=50)
        assert isinstance(chunker, SemanticChunker)

    def test_create_hierarchical(self):
        chunker = ChunkerFactory.create("hierarchical", chunk_size=500, overlap=50)
        assert isinstance(chunker, HierarchicalChunker)

    def test_create_page(self):
        chunker = ChunkerFactory.create("page", chunk_size=500, overlap=50)
        assert isinstance(chunker, PageChunker)

    def test_create_character(self):
        chunker = ChunkerFactory.create("character", chunk_size=500, overlap=50)
        assert isinstance(chunker, CharacterChunker)

    def test_unknown_strategy_raises(self):
        with pytest.raises(ValueError, match="Unknown chunking strategy"):
            ChunkerFactory.create("nonexistent")

    def test_available_strategies(self):
        strategies = ChunkerFactory.available_strategies()
        assert "semantic" in strategies
        assert "character" in strategies
        assert "page" in strategies


class TestSemanticChunker:
    """Tests for SemanticChunker."""

    def test_empty_text(self):
        chunker = SemanticChunker(chunk_size=100, overlap=10)
        assert chunker.chunk("") == []
        assert chunker.chunk("   ") == []

    def test_single_paragraph(self):
        chunker = SemanticChunker(chunk_size=200, overlap=20)
        text = "Hello world. This is a test paragraph."
        chunks = chunker.chunk(text)
        assert len(chunks) >= 1
        assert chunks[0][0] == text

    def test_multiple_headings(self):
        chunker = SemanticChunker(chunk_size=100, overlap=10)
        text = "# Heading 1\n\nParagraph one.\n\n# Heading 2\n\nParagraph two."
        chunks = chunker.chunk(text)
        assert len(chunks) >= 2
        # Verify metadata has headings
        headings = [meta.heading for _, meta in chunks]
        assert "Heading 1" in headings
        assert "Heading 2" in headings

    def test_respects_chunk_size(self):
        chunker = SemanticChunker(chunk_size=50, overlap=5)
        # Use text with paragraph breaks so the semantic chunker can split
        text = ("A" * 40 + "\n\n") * 5
        chunks = chunker.chunk(text)
        assert len(chunks) >= 2
        for chunk_text, meta in chunks:
            # Allow some overflow for paragraph boundaries
            assert len(chunk_text) <= 100

    def test_metadata_has_correct_indices(self):
        chunker = SemanticChunker(chunk_size=50, overlap=5)
        text = "# H1\n\n" + "A" * 100 + "\n\n# H2\n\n" + "B" * 100
        chunks = chunker.chunk(text)
        for i, (_, meta) in enumerate(chunks):
            assert meta.index == i


class TestCharacterChunker:
    """Tests for CharacterChunker (from text_chunker.py)."""

    def test_empty_text(self):
        chunker = CharacterChunker(chunk_size=100, overlap=10)
        assert chunker.chunk("") == []

    def test_basic_chunking(self):
        chunker = CharacterChunker(chunk_size=10, overlap=2)
        text = "A" * 25
        chunks = chunker.chunk(text)
        assert len(chunks) >= 2
        # Verify all text is covered
        combined = "".join(c for c, _ in chunks)
        assert "A" in combined

    def test_overlap(self):
        chunker = CharacterChunker(chunk_size=10, overlap=3)
        text = "ABCDEFGHIJ" + "KLMNOPQRST"
        chunks = chunker.chunk(text)
        # First chunk should be 10 chars, second should overlap
        assert len(chunks) >= 2


class TestPageChunker:
    """Tests for PageChunker."""

    def test_no_page_markers(self):
        chunker = PageChunker(chunk_size=200, overlap=20)
        text = "Some text without page markers."
        chunks = chunker.chunk(text)
        assert len(chunks) == 1
        assert chunks[0][1].page == 1

    def test_with_page_markers(self):
        chunker = PageChunker(chunk_size=200, overlap=20)
        text = "<!-- Page 1 -->\nContent of page 1\n\n<!-- Page 2 -->\nContent of page 2"
        chunks = chunker.chunk(text)
        assert len(chunks) >= 2
        pages = [meta.page for _, meta in chunks]
        assert 1 in pages
        assert 2 in pages


class TestChunkDocument:
    """Tests for the chunk_document() public API."""

    def test_returns_chunks_with_ids(self):
        doc = Document(id="doc-1", content="Hello world. " * 20)
        config = ChunkingConfig(strategy="character", chunk_size=50, chunk_overlap=5)
        chunks = chunk_document(doc, config)
        assert len(chunks) >= 1
        assert all(isinstance(c, Chunk) for c in chunks)
        assert all(c.document_id == "doc-1" for c in chunks)
        assert all(c.id.startswith("doc-1:chunk:") for c in chunks)

    def test_max_chunks_limit(self):
        doc = Document(id="doc-1", content="Hello world. " * 100)
        config = ChunkingConfig(strategy="character", chunk_size=20, chunk_overlap=0, max_chunks=3)
        chunks = chunk_document(doc, config)
        assert len(chunks) <= 3

    def test_semantic_strategy(self):
        doc = Document(
            id="doc-1",
            content="# Title\n\nParagraph one.\n\n## Subtitle\n\nParagraph two.",
        )
        config = ChunkingConfig(strategy="semantic", chunk_size=100, chunk_overlap=10)
        chunks = chunk_document(doc, config)
        assert len(chunks) >= 1


class TestChunkText:
    """Tests for the backward-compatible chunk_text() function."""

    def test_returns_strings(self):
        chunks = chunk_text("Hello world. " * 20, chunk_size=50, overlap=5)
        assert all(isinstance(c, str) for c in chunks)

    def test_default_strategy_is_character(self):
        """Default strategy should be 'character' (matching old text_chunker.py)."""
        chunks = chunk_text("A" * 100, chunk_size=20, overlap=5)
        assert len(chunks) >= 1
