"""tests/tools/documents/test_embedding.py — Tests for document embedding."""

from __future__ import annotations

import pytest

from tools.builtin.documents.embedding import resolve_provider


class TestResolveProvider:
    """Tests for provider resolution."""

    def test_explicit_config_provider(self):
        from core.types import EmbeddingConfig

        config = EmbeddingConfig(provider="voyage", model="voyage-3-lite", api_key="test")
        assert resolve_provider(config) == "voyage"

    def test_explicit_config_provider_fastembed(self):
        from core.types import EmbeddingConfig

        config = EmbeddingConfig(provider="fastembed", model="BAAI/bge-small-en-v1.5")
        assert resolve_provider(config) == "fastembed"

    def test_env_var_provider(self, monkeypatch):
        monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
        assert resolve_provider() == "openai"

    def test_env_var_fallback_to_fastembed(self, monkeypatch):
        monkeypatch.delenv("EMBEDDING_PROVIDER", raising=False)
        monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        assert resolve_provider() == "fastembed"


class TestEmbedTexts:
    """Tests for embed_texts (requires fastembed or will be skipped)."""

    @pytest.mark.asyncio
    async def test_empty_texts(self):
        from tools.builtin.documents.embedding import embed_texts

        result = await embed_texts([])
        assert result == []

    @pytest.mark.asyncio
    async def test_fastembed(self):
        """Test with fastembed (local, no API key needed)."""
        fastembed = pytest.importorskip("fastembed")
        from tools.builtin.documents.embedding import embed_texts

        result = await embed_texts(["hello world", "test document"])
        assert len(result) == 2
        assert all(isinstance(emb, list) for emb in result)
        assert all(len(emb) > 0 for emb in result)


class TestEmbedChunks:
    """Tests for embed_chunks."""

    @pytest.mark.asyncio
    async def test_empty_chunks(self):
        from tools.builtin.documents.embedding import embed_chunks

        result = await embed_chunks([])
        assert result == []

    @pytest.mark.asyncio
    async def test_fastembed_chunks(self):
        """Test with fastembed (local, no API key needed)."""
        fastembed = pytest.importorskip("fastembed")
        from core.types import Chunk
        from tools.builtin.documents.embedding import embed_chunks

        chunks = [
            Chunk(id="c1", document_id="d1", content="hello world"),
            Chunk(id="c2", document_id="d1", content="test document"),
        ]
        result = await embed_chunks(chunks)
        assert len(result) == 2
        assert all(c.embedding is not None for c in result)
        assert all(len(c.embedding) > 0 for c in result)
        # Verify original fields preserved
        assert result[0].id == "c1"
        assert result[0].content == "hello world"
