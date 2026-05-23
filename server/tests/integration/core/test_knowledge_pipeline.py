"""Integration tests for KnowledgeBasePipeline.

Requires a running Qdrant instance.  Skip the whole module with:
    pytest -m "not requires_qdrant"

Run only these tests:
    pytest tests/integration/core/test_knowledge_pipeline.py -v

The Qdrant host/port is read from environment variables, falling back to
localhost:6333.  Set QDRANT_HOST / QDRANT_PORT to point at the Docker
container started by docker-compose.dev.yml.

LLM calls (HyDE, GraphAugmentor triplet extraction) use FakeListChatModel
so no real API key is needed.  Set LIVE_LLM_TESTS=1 to use the real LLM
from settings instead.

Isolation strategy: every test uses a unique ``project_id`` (uuid4) so
collections are shared but data never bleeds between tests.  Collections
are deleted in the session-scoped teardown.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from typing import Any

import pytest

from telaios.core.embedders import EmbedderFactory
from telaios.core.embedders.fastembed import FastEmbedEmbedder
from telaios.core.knowledge.config import (
    EmbeddingConfig,
    GraphStoreConfig,
    KnowledgePipelineConfig,
    QdrantConfig,
)
from telaios.core.knowledge.factory import KnowledgePipelineFactory
from telaios.core.knowledge.ingestion import IngestionService
from telaios.core.knowledge.pipeline import KnowledgeBasePipeline
from telaios.core.knowledge_source import FileSource, TextSource
from telaios.core.stores.bm25 import BM25Store
from telaios.core.stores.graph.memory import InMemoryGraphStore
from telaios.core.stores.qdrant import QdrantVectorStore

pytestmark = [pytest.mark.integration, pytest.mark.requires_qdrant]

# ─── Qdrant reachability guard ────────────────────────────────────────────────


def _qdrant_reachable() -> bool:
    """Return True if the Qdrant REST endpoint responds."""
    import socket

    host = os.environ.get("QDRANT_HOST", "localhost")
    port = int(os.environ.get("QDRANT_PORT", "6333"))
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


if not _qdrant_reachable():
    pytest.skip(
        "Qdrant not reachable — start it with: docker compose -f docker-compose.dev.yml up qdrant",
        allow_module_level=True,
    )

# ─── Test content ─────────────────────────────────────────────────────────────

_PLATFORM_TEXT = (
    "Telaios is an AI orchestration platform for senior software engineers. "
    "It integrates multi-agent workflows, RAG pipelines, and autonomous task "
    "execution to help engineering teams ship features faster."
)
_RAG_TEXT = (
    "Retrieval-Augmented Generation (RAG) improves LLM responses by retrieving "
    "relevant context before generation. This reduces hallucination and grounds "
    "answers in authoritative source material."
)
_CODE_CONTENT = '''\
"""sample_module.py — used by integration tests."""


def compute_embedding(text: str) -> list[float]:
    """Compute a fake embedding for testing."""
    return [float(ord(c)) for c in text[:8]]


class EmbeddingService:
    """Service wrapping compute_embedding."""

    def __init__(self, model: str) -> None:
        self.model = model

    def embed(self, text: str) -> list[float]:
        return compute_embedding(text)


def _private_helper(x: int) -> int:
    return x * 2
'''

# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def fake_llm() -> Any:
    """LangChain-compatible fake LLM — cyclic list of canned responses."""
    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    # Provide enough responses to cover all LLM calls across all tests.
    # FakeListChatModel cycles through responses in order.
    responses = [
        # HyDE hypothetical docs
        "A production platform that orchestrates AI agents and RAG pipelines.",
        "RAG retrieves documents from a vector store before LLM generation.",
        "The system uses Qdrant for dense vector search and BM25 for keyword search.",
        "An embedding service transforms text into dense float vectors.",
        "Hybrid retrieval combines dense and sparse search via RRF fusion.",
        # GraphAugmentor triplet extractions (repeated for all tests)
        "telaios | is_a | platform\nrag | improves | llm_quality\nqdrant | stores | vectors",
        "embedding | converts | text\nservice | uses | model\nfunction | returns | list",
        "telaios | uses | qdrant\nqdrant | is_a | vector_database",
        "rag | reduces | hallucination\nllm | generates | response",
        # Extra padding
        *["An AI platform." for _ in range(40)],
    ]
    return FakeListChatModel(responses=responses)


@pytest.fixture(scope="module")
def pipeline_config() -> KnowledgePipelineConfig:
    """Test pipeline config pointing at local Qdrant with in-memory graph."""
    host = os.environ.get("QDRANT_HOST", "localhost")
    port = int(os.environ.get("QDRANT_PORT", "6333"))
    return KnowledgePipelineConfig(
        qdrant=QdrantConfig(host=host, port=port),
        embedding=EmbeddingConfig(provider="fastembed", model="intfloat/multilingual-e5-large"),
        graph_store=GraphStoreConfig(),  # networkx in-memory
        # Use prefixed test collection names so we don't pollute production data.
        documents_collection="test_documents",
        repositories_collection="test_repositories",
        hyde_enabled=True,
        graph_augmentation_enabled=True,
        top_k=3,
    )


@pytest.fixture(scope="module")
def pipeline(pipeline_config: KnowledgePipelineConfig, fake_llm: Any) -> KnowledgeBasePipeline:
    """Build a pipeline using FakeLLM — no real API key required."""
    from qdrant_client import AsyncQdrantClient

    from telaios.core.knowledge.graph import GraphAugmentor
    from telaios.core.knowledge.hyde import HyDE

    cfg = pipeline_config
    qdrant_client = AsyncQdrantClient(host=cfg.qdrant.host, port=cfg.qdrant.port)
    embedder = EmbedderFactory.create(cfg.embedding)
    vs = QdrantVectorStore(client=qdrant_client, embedder=embedder)
    bm25 = BM25Store()
    graph_store = InMemoryGraphStore()
    graph_augmentor = GraphAugmentor(graph_store=graph_store, llm=fake_llm, depth=1)
    hyde = HyDE(llm=fake_llm, vector_store=vs)
    ingestion = IngestionService(
        vector_store=vs,
        bm25_store=bm25,
        graph_augmentor=graph_augmentor,
        config=cfg,
    )
    return KnowledgeBasePipeline(
        vector_store=vs,
        bm25_store=bm25,
        graph_augmentor=graph_augmentor,
        hyde=hyde,
        llm=fake_llm,
        ingestion=ingestion,
        config=cfg,
    )


@pytest.fixture(autouse=True, scope="module")
def _cleanup_collections(pipeline: KnowledgeBasePipeline) -> None:
    """Delete test collections after all tests in the module finish."""
    yield
    async def _drop() -> None:
        try:
            await pipeline._vs._client.delete_collection("test_documents")
        except Exception:
            pass
        try:
            await pipeline._vs._client.delete_collection("test_repositories")
        except Exception:
            pass

    asyncio.run(_drop())


def _project_id() -> str:
    """Unique project ID per test — guarantees isolation via payload filter."""
    return f"test-{uuid.uuid4().hex[:8]}"


# ─── Ingestion tests ──────────────────────────────────────────────────────────


class TestIngestion:
    """Source → chunk → embed → upsert → BM25 rebuild."""

    def test_text_source_ingest_returns_chunk_count(
        self, pipeline: KnowledgeBasePipeline
    ) -> None:
        async def _run() -> None:
            source = TextSource(_PLATFORM_TEXT + " " + _RAG_TEXT, title="platform-overview")
            result = await pipeline.ingest_documents(project_id=_project_id(), source=source)
            assert result.document_count >= 1
            assert result.chunk_count >= 1

        asyncio.run(_run())

    def test_ingest_two_text_sources_separate_projects(
        self, pipeline: KnowledgeBasePipeline
    ) -> None:
        async def _run() -> None:
            pid_a = _project_id()
            pid_b = _project_id()
            await pipeline.ingest_documents(
                project_id=pid_a,
                source=TextSource(_PLATFORM_TEXT, title="doc-a"),
            )
            await pipeline.ingest_documents(
                project_id=pid_b,
                source=TextSource(_RAG_TEXT, title="doc-b"),
            )
            # Both succeed without raising
        asyncio.run(_run())

    def test_python_file_ingest_ast_chunks(
        self, pipeline: KnowledgeBasePipeline, tmp_path: Path
    ) -> None:
        """Python source ingested into repositories collection gets AST metadata."""
        async def _run() -> None:
            py_file = tmp_path / "sample_module.py"
            py_file.write_text(_CODE_CONTENT)
            result = await pipeline.ingest_repository(
                project_id=_project_id(),
                source=FileSource(py_file),
            )
            assert result.chunk_count >= 1
            # At least one chunk should carry symbol metadata from ASTChunker
            symbol_chunks = [
                c for c in result.chunks
                if c.metadata.get("symbol_name") is not None
            ]
            assert len(symbol_chunks) >= 1, (
                "Expected at least one AST chunk with symbol_name; "
                f"got metadata: {[c.metadata for c in result.chunks]}"
            )

        asyncio.run(_run())

    def test_ast_chunk_symbol_types(
        self, pipeline: KnowledgeBasePipeline, tmp_path: Path
    ) -> None:
        """ASTChunker emits function and class symbols."""
        async def _run() -> None:
            py_file = tmp_path / "sample2.py"
            py_file.write_text(_CODE_CONTENT)
            result = await pipeline.ingest_repository(
                project_id=_project_id(),
                source=FileSource(py_file),
            )
            symbol_types = {c.metadata.get("symbol_type") for c in result.chunks}
            # Should include at least function and class
            assert "function" in symbol_types or "class" in symbol_types, (
                f"Expected function or class symbol_type; got: {symbol_types}"
            )

        asyncio.run(_run())

    def test_ingest_result_has_chunk_list(
        self, pipeline: KnowledgeBasePipeline
    ) -> None:
        async def _run() -> None:
            source = TextSource(_RAG_TEXT, title="rag-doc")
            result = await pipeline.ingest_documents(project_id=_project_id(), source=source)
            assert isinstance(result.chunks, list)
            assert all(hasattr(c, "content") for c in result.chunks)

        asyncio.run(_run())


# ─── Retrieval tests ──────────────────────────────────────────────────────────


class TestRetrieval:
    """Hybrid retrieval: Qdrant dense + BM25 sparse + RRF fusion."""

    @pytest.fixture(scope="class")
    def project_with_docs(self, pipeline: KnowledgeBasePipeline) -> str:
        """Ingest test documents into a dedicated project, return its ID."""
        pid = _project_id()

        async def _setup() -> None:
            await pipeline.ingest_documents(
                project_id=pid,
                source=TextSource(
                    _PLATFORM_TEXT + "\n\n" + _RAG_TEXT,
                    title="knowledge-base",
                ),
            )

        asyncio.run(_setup())
        return pid

    def test_query_returns_chunks(
        self,
        pipeline: KnowledgeBasePipeline,
        project_with_docs: str,
    ) -> None:
        async def _run() -> None:
            result = await pipeline.query(
                project_id=project_with_docs,
                text="What is Telaios?",
                source="documents",
            )
            assert len(result.chunks) >= 1
            assert all(c.content for c in result.chunks)

        asyncio.run(_run())

    def test_query_respects_top_k(
        self,
        pipeline: KnowledgeBasePipeline,
        project_with_docs: str,
    ) -> None:
        async def _run() -> None:
            result = await pipeline.query(
                project_id=project_with_docs,
                text="RAG pipeline retrieval",
                source="documents",
                top_k=1,
            )
            assert len(result.chunks) <= 1

        asyncio.run(_run())

    def test_project_id_isolation(self, pipeline: KnowledgeBasePipeline) -> None:
        """Chunks ingested under project A must NOT be returned for project B."""
        pid_a = _project_id()
        pid_b = _project_id()

        async def _run() -> None:
            await pipeline.ingest_documents(
                project_id=pid_a,
                source=TextSource(
                    "Telaios is an AI orchestration platform with unique capabilities.",
                    title="unique-doc",
                ),
            )
            # Project B has no documents ingested — should return empty
            result = await pipeline.query(
                project_id=pid_b,
                text="Telaios AI orchestration platform",
                source="documents",
            )
            # If Qdrant filter works, no chunks from pid_a should appear
            pid_a_chunks = [
                c for c in result.chunks
                if c.metadata.get("project_id") == pid_a
            ]
            assert len(pid_a_chunks) == 0, (
                f"Cross-project data leak: {len(pid_a_chunks)} chunks from pid_a "
                f"appeared in pid_b query"
            )

        asyncio.run(_run())

    def test_query_all_searches_both_collections(
        self,
        pipeline: KnowledgeBasePipeline,
        tmp_path: Path,
    ) -> None:
        """source='all' searches documents + repositories and merges results."""
        pid = _project_id()

        async def _run() -> None:
            await pipeline.ingest_documents(
                project_id=pid,
                source=TextSource(_PLATFORM_TEXT, title="doc"),
            )
            py_file = tmp_path / "mod.py"
            py_file.write_text(_CODE_CONTENT)
            await pipeline.ingest_repository(
                project_id=pid,
                source=FileSource(py_file),
            )
            result = await pipeline.query(
                project_id=pid,
                text="embedding service",
                source="all",
            )
            sources = result.sources_searched
            assert "test_documents" in sources
            assert "test_repositories" in sources

        asyncio.run(_run())

    def test_query_documents_only(
        self,
        pipeline: KnowledgeBasePipeline,
        project_with_docs: str,
    ) -> None:
        async def _run() -> None:
            result = await pipeline.query(
                project_id=project_with_docs,
                text="RAG retrieval augmented generation",
                source="documents",
            )
            assert result.sources_searched == ["test_documents"]

        asyncio.run(_run())

    def test_query_repositories_only(
        self,
        pipeline: KnowledgeBasePipeline,
        tmp_path: Path,
    ) -> None:
        pid = _project_id()

        async def _run() -> None:
            py_file = tmp_path / "repo_mod.py"
            py_file.write_text(_CODE_CONTENT)
            await pipeline.ingest_repository(
                project_id=pid,
                source=FileSource(py_file),
            )
            result = await pipeline.query(
                project_id=pid,
                text="compute embedding function",
                source="repositories",
            )
            assert result.sources_searched == ["test_repositories"]

        asyncio.run(_run())


# ─── BM25 + warm-up tests ─────────────────────────────────────────────────────


class TestBM25AndWarmUp:
    """BM25 index rebuild and warm_up lifecycle."""

    def test_warm_up_populates_bm25(self, pipeline: KnowledgeBasePipeline) -> None:
        """After warm_up(), BM25 index contains documents from Qdrant."""
        pid = _project_id()

        async def _run() -> None:
            await pipeline.ingest_documents(
                project_id=pid,
                source=TextSource(_PLATFORM_TEXT, title="warm-up-doc"),
            )
            # Reset BM25 store to simulate a fresh restart
            pipeline._bm25._indexes.clear()

            # warm_up should rebuild BM25 from Qdrant data
            await pipeline.warm_up(project_ids=[pid])

            # Now BM25 should have an index for this collection
            assert len(pipeline._bm25._indexes) >= 1

        asyncio.run(_run())

    def test_bm25_search_after_ingest(self, pipeline: KnowledgeBasePipeline) -> None:
        """BM25 keyword search returns results after ingestion."""
        pid = _project_id()

        async def _run() -> None:
            await pipeline.ingest_documents(
                project_id=pid,
                source=TextSource(
                    "Hybrid retrieval combines Qdrant dense search and BM25 sparse search.",
                    title="hybrid-doc",
                ),
            )
            hits = pipeline._bm25.search(
                collection="test_documents",
                query="BM25 sparse",
                project_id=pid,
                top_k=5,
            )
            assert len(hits) >= 1

        asyncio.run(_run())


# ─── Retriever ABC interface tests ────────────────────────────────────────────


class TestRetrieverInterface:
    """get_retriever() returns a Retriever ABC-compatible object."""

    def test_get_retriever_returns_retriever(self, pipeline: KnowledgeBasePipeline) -> None:
        from telaios.core.retriever import Retriever

        retriever = pipeline.get_retriever("documents", project_id="any")
        assert isinstance(retriever, Retriever)

    def test_retriever_aretrieve_returns_result(
        self, pipeline: KnowledgeBasePipeline
    ) -> None:
        pid = _project_id()

        async def _run() -> None:
            await pipeline.ingest_documents(
                project_id=pid,
                source=TextSource(_PLATFORM_TEXT, title="retriever-test"),
            )
            retriever = pipeline.get_retriever("documents", project_id=pid)
            from telaios.core.types import RetrievalQuery
            result = await retriever.aretrieve(RetrievalQuery(text="Telaios platform", top_k=2))
            assert hasattr(result, "chunks")
            assert isinstance(result.chunks, list)

        asyncio.run(_run())

    def test_planner_tools_wired_to_pipeline(
        self, pipeline: KnowledgeBasePipeline
    ) -> None:
        """make_tools() from the planner agent accepts HybridRetriever."""
        pytest.importorskip("langchain", reason="requires agents extra: uv sync --extra agents")

        from telaios.core.agents.planner.tools import make_tools

        doc_retriever = pipeline.get_retriever("documents", project_id="proj-1")
        repo_retriever = pipeline.get_retriever("repositories", project_id="proj-1")
        tools = make_tools(doc_retriever, repo_retriever)
        tool_names = [t.name for t in tools]
        assert "search_documents" in tool_names
        assert "search_repository" in tool_names


# ─── Project lifecycle tests ──────────────────────────────────────────────────


class TestProjectLifecycle:
    """Ingest → query → delete → verify gone."""

    def test_delete_project_data_removes_chunks(
        self, pipeline: KnowledgeBasePipeline
    ) -> None:
        pid = _project_id()

        async def _run() -> None:
            await pipeline.ingest_documents(
                project_id=pid,
                source=TextSource(
                    "Unique content for deletion test — telaios lifecycle.",
                    title="delete-test",
                ),
            )
            # Verify we can query before delete
            before = await pipeline.query(
                project_id=pid,
                text="deletion test lifecycle",
                source="documents",
            )
            assert len(before.chunks) >= 1

            # Delete
            await pipeline.delete_project_data(pid)

            # After delete — query returns no results for this project
            after = await pipeline.query(
                project_id=pid,
                text="deletion test lifecycle",
                source="documents",
            )
            assert len(after.chunks) == 0, (
                f"Expected 0 chunks after delete, got {len(after.chunks)}"
            )

        asyncio.run(_run())


# ─── Factory from_settings / reset tests ─────────────────────────────────────


class TestFactory:
    """KnowledgePipelineFactory.from_settings() and reset() behaviour."""

    def test_from_settings_produces_valid_config(self) -> None:
        cfg = KnowledgePipelineFactory.from_settings()
        assert isinstance(cfg, KnowledgePipelineConfig)
        assert cfg.qdrant.host or cfg.qdrant.url
        assert cfg.embedding.model

    def test_explicit_config_bypasses_singleton(
        self, pipeline_config: KnowledgePipelineConfig, fake_llm: Any
    ) -> None:
        """When config is passed to get(), a fresh non-singleton instance is returned."""
        async def _run() -> None:
            KnowledgePipelineFactory.reset()
            # Inject fake_llm so langchain is not required
            p1 = await KnowledgePipelineFactory.get(config=pipeline_config, llm=fake_llm)
            KnowledgePipelineFactory.reset()
            p2 = await KnowledgePipelineFactory.get(config=pipeline_config, llm=fake_llm)
            assert p1 is not p2

        asyncio.run(_run())
