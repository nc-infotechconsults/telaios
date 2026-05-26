"""Tests for the graph-native retrieval tools: graph_navigate, read_source (FileReader-backed), doc_to_code."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.core.agents.retrieval.state import SearchStep
from telaios.core.knowledge.config import KnowledgePipelineConfig
from telaios.core.types import Chunk


def _make_tools(graph_rows=None, file_content="", doc_refs=None):
    from telaios.core.agents.retrieval.tools import RetrievalTools

    config = KnowledgePipelineConfig()

    # Graph store mock
    graph_store = MagicMock()
    graph_store.query.return_value = graph_rows or []

    # Graph augmentor wrapping the store
    graph_augmentor = MagicMock()
    graph_augmentor._graph = graph_store
    graph_augmentor._llm = None
    graph_augmentor.query_structural = AsyncMock(return_value=[])

    # FileReader mock
    file_reader = MagicMock()
    file_reader.read = AsyncMock(return_value=file_content)

    vector_store = MagicMock()
    vector_store.search = AsyncMock(return_value=[])
    vector_store.embed_query = AsyncMock(return_value=[0.0] * 1024)

    bm25_store = MagicMock()
    bm25_store.search = MagicMock(return_value=[])

    return RetrievalTools(
        vector_store=vector_store,
        bm25_store=bm25_store,
        graph_augmentor=graph_augmentor,
        hyde=None,
        config=config,
        project_id="proj-1",
        source="all",
        top_k=5,
        file_reader=file_reader,
    )


class TestGraphNavigate:
    @pytest.mark.asyncio
    async def test_returns_chunks_with_file_path_metadata(self):
        rows = [{"name": "UserService", "file_path": "src/UserService.java",
                 "start_line": 10, "end_line": 50, "type": "CodeClass"}]
        tools = _make_tools(graph_rows=rows)
        step = SearchStep(sub_query="UserService", tool="graph_navigate", reason="test")
        chunks, scores = await tools.execute(step)
        assert len(chunks) == 1
        assert chunks[0].metadata["file_path"] == "src/UserService.java"
        assert chunks[0].metadata["start_line"] == 10

    @pytest.mark.asyncio
    async def test_empty_graph_returns_empty(self):
        tools = _make_tools(graph_rows=[])
        step = SearchStep(sub_query="Unknown", tool="graph_navigate", reason="test")
        chunks, scores = await tools.execute(step)
        assert chunks == []
        assert scores == []


class TestReadSourceFileReader:
    @pytest.mark.asyncio
    async def test_read_source_uses_file_reader(self):
        tools = _make_tools(file_content="def foo(): pass\n")
        step = SearchStep(sub_query="src/foo.py", tool="read_source", reason="test")
        chunks, scores = await tools.execute(step)
        tools.file_reader.read.assert_called_once()
        assert len(chunks) == 1
        assert "def foo" in chunks[0].content

    @pytest.mark.asyncio
    async def test_read_source_parses_line_range(self):
        tools = _make_tools(file_content="relevant code\n")
        # "path:10:50" format encodes line range
        step = SearchStep(sub_query="src/Foo.java:10:50", tool="read_source", reason="test")
        await tools.execute(step)
        _, kwargs = tools.file_reader.read.call_args
        assert kwargs.get("start_line") == 10
        assert kwargs.get("end_line") == 50

    @pytest.mark.asyncio
    async def test_read_source_empty_content_returns_empty(self):
        tools = _make_tools(file_content="")
        step = SearchStep(sub_query="missing.py", tool="read_source", reason="test")
        chunks, scores = await tools.execute(step)
        assert chunks == []


class TestDocToCode:
    @pytest.mark.asyncio
    async def test_fast_path_returns_references(self):
        tools = _make_tools()
        # First query: find the Doc_Section; second: find REFERENCES
        tools.graph_augmentor._graph.query.side_effect = [
            [{"id": "auth-req", "heading": "Auth", "summary": "JWT auth required"}],
            [{"name": "AuthService", "file_path": "src/AuthService.java",
              "start_line": 1, "end_line": 30, "entity_type": "CodeClass", "via": "annotation"}],
        ]
        step = SearchStep(sub_query="auth-req", tool="doc_to_code", reason="test")
        chunks, scores = await tools.execute(step)
        assert len(chunks) == 1
        assert "AuthService" in chunks[0].content

    @pytest.mark.asyncio
    async def test_returns_empty_when_section_not_found(self):
        tools = _make_tools(graph_rows=[])
        step = SearchStep(sub_query="nonexistent", tool="doc_to_code", reason="test")
        chunks, scores = await tools.execute(step)
        assert chunks == []


class TestVectorSearchDocumentsOnly:
    @pytest.mark.asyncio
    async def test_vector_search_only_queries_documents_collection(self):
        tools = _make_tools()
        step = SearchStep(sub_query="how does auth work", tool="vector_search", reason="test")
        await tools.execute(step)
        # Only the documents collection should be queried — not repositories
        search_calls = tools.vector_store.search.call_args_list
        collections_queried = [c[1].get("collection") or c[0][0] for c in search_calls]
        assert all(c == "documents" for c in collections_queried), \
            f"vector_search hit non-documents collection: {collections_queried}"
