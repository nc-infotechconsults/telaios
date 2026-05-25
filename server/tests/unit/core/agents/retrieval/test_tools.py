"""Unit tests for RetrievalTools — retrieval tool wrappers."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from telaios.core.agents.retrieval.state import SearchStep
from telaios.core.agents.retrieval.tools import RetrievalTools
from telaios.core.types import Chunk


def _make_tools(
    vs_results=None,
    bm25_results=None,
    graph_results=None,
):
    """Build a RetrievalTools instance with mocked dependencies."""
    from telaios.core.knowledge.config import KnowledgePipelineConfig

    config = KnowledgePipelineConfig()

    def _chunk(i):
        return {"id": str(i), "content": f"content {i}", "metadata": {"document_id": "d1"}}

    vector_store = MagicMock()
    vector_store.search = AsyncMock(return_value=vs_results or [_chunk(1)])
    vector_store.embed_query = AsyncMock(return_value=[0.1] * 1024)

    bm25_store = MagicMock()
    bm25_store.search = MagicMock(return_value=bm25_results or [_chunk(2)])

    graph_augmentor = MagicMock()
    graph_augmentor.query_structural = AsyncMock(
        return_value=graph_results or [
            Chunk(id="g1", document_id="kg", content="graph result", metadata={})
        ]
    )

    return RetrievalTools(
        vector_store=vector_store,
        bm25_store=bm25_store,
        graph_augmentor=graph_augmentor,
        hyde=None,
        config=config,
        project_id="proj-1",
        source="all",
        top_k=5,
    )


class TestRetrievalToolsVectorSearch:
    @pytest.mark.asyncio
    async def test_vector_search_returns_chunks(self):
        tools = _make_tools()
        step = SearchStep(sub_query="how does auth work", tool="vector_search", reason="semantic")
        chunks, scores = await tools.execute(step)
        assert len(chunks) > 0
        assert len(scores) == len(chunks)

    @pytest.mark.asyncio
    async def test_vector_search_chunk_has_content(self):
        tools = _make_tools()
        step = SearchStep(sub_query="q", tool="vector_search", reason="r")
        chunks, _ = await tools.execute(step)
        assert all(c.content for c in chunks)


class TestRetrievalToolsBm25:
    @pytest.mark.asyncio
    async def test_bm25_returns_chunks(self):
        tools = _make_tools()
        step = SearchStep(sub_query="UserService", tool="bm25", reason="exact match")
        chunks, scores = await tools.execute(step)
        assert len(chunks) > 0

    @pytest.mark.asyncio
    async def test_bm25_scores_are_unit(self):
        tools = _make_tools()
        step = SearchStep(sub_query="q", tool="bm25", reason="r")
        _, scores = await tools.execute(step)
        assert all(0.0 <= s <= 1.0 for s in scores)


class TestRetrievalToolsGraphStructural:
    @pytest.mark.asyncio
    async def test_graph_structural_returns_chunks(self):
        tools = _make_tools()
        step = SearchStep(sub_query="which classes extend BaseController", tool="graph_structural", reason="inheritance")
        chunks, scores = await tools.execute(step)
        assert len(chunks) > 0

    @pytest.mark.asyncio
    async def test_graph_structural_empty_fallback(self):
        tools = _make_tools(graph_results=[])
        step = SearchStep(sub_query="q", tool="graph_structural", reason="r")
        chunks, scores = await tools.execute(step)
        assert isinstance(chunks, list)
        assert isinstance(scores, list)


class TestRetrievalToolsGeneratedDocs:
    @pytest.mark.asyncio
    async def test_generated_docs_returns_chunks(self):
        tools = _make_tools()
        step = SearchStep(sub_query="how does this app work overall", tool="generated_docs", reason="architecture")
        chunks, scores = await tools.execute(step)
        assert isinstance(chunks, list)


@pytest.fixture
def tools():
    return _make_tools()


class TestRetrievalToolsReadSource:
    @pytest.mark.asyncio
    async def test_read_source_with_path_query(self, tools):
        """When sub_query contains '/', fetch_by_source_path is called with it directly."""
        chunk = Chunk(
            id="c1", document_id="d1", content="class A {}",
            metadata={"start_line": 1, "source_path": "src/A.java"},
        )
        tools.vector_store.fetch_by_source_path = AsyncMock(return_value=[chunk])

        step = SearchStep(sub_query="src/A.java", tool="read_source", reason="test")
        chunks, scores = await tools.execute(step)

        assert len(chunks) == 1
        assert chunks[0].id == "c1"
        assert scores == [1.0]
        tools.vector_store.fetch_by_source_path.assert_called()

    @pytest.mark.asyncio
    async def test_read_source_with_symbol_resolves_via_bm25(self, tools):
        """When sub_query has no '/', BM25 top-1 resolves the source_path."""
        tools.bm25_store.search.return_value = [
            {
                "id": "x",
                "content": "class UserService {}",
                "metadata": {"source_path": "src/UserService.java"},
            }
        ]
        chunk = Chunk(
            id="c2", document_id="d2", content="class UserService {}",
            metadata={"start_line": 1},
        )
        tools.vector_store.fetch_by_source_path = AsyncMock(return_value=[chunk])

        step = SearchStep(sub_query="UserService", tool="read_source", reason="test")
        chunks, scores = await tools.execute(step)

        assert len(chunks) == 1
        # fetch_by_source_path must have been called with the resolved path
        all_calls = tools.vector_store.fetch_by_source_path.call_args_list
        resolved_paths = [
            (c.kwargs.get("source_path") or (c.args[2] if len(c.args) > 2 else None))
            for c in all_calls
        ]
        assert "src/UserService.java" in resolved_paths

    @pytest.mark.asyncio
    async def test_read_source_returns_empty_when_no_chunks(self, tools):
        """Returns empty lists when fetch_by_source_path finds nothing."""
        tools.vector_store.fetch_by_source_path = AsyncMock(return_value=[])

        step = SearchStep(sub_query="src/Missing.java", tool="read_source", reason="test")
        chunks, scores = await tools.execute(step)

        assert chunks == []
        assert scores == []

    @pytest.mark.asyncio
    async def test_read_source_sorts_chunks_by_start_line(self, tools):
        """Chunks are returned sorted by start_line ascending."""
        c1 = Chunk(id="c1", document_id="d", content="line10", metadata={"start_line": 10})
        c2 = Chunk(id="c2", document_id="d", content="line1", metadata={"start_line": 1})
        c3 = Chunk(id="c3", document_id="d", content="line5", metadata={"start_line": 5})
        tools.vector_store.fetch_by_source_path = AsyncMock(return_value=[c1, c2, c3])

        step = SearchStep(sub_query="src/A.java", tool="read_source", reason="test")
        chunks, _ = await tools.execute(step)

        assert [c.id for c in chunks] == ["c2", "c3", "c1"]
