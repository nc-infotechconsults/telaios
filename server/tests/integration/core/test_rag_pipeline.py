"""
E2E integration tests for the Chroma-backed RAG pipeline.

Covers:
  - RagManager client lifecycle (ephemeral client)
  - Document ingestion → retrieval via ChromaRetriever
  - All 6 RAG strategies: Simple, Hybrid, Agentic, Graph, CRAG, Self-RAG
  - End-to-end: ingest → create_pipeline → answer

Uses Chroma's ephemeral client (in-memory, no external container).
Uses FakeLLM for deterministic responses (no API keys required).
Mark ``--real-llm`` tests that require live API credentials.

Sources:
  - Chroma ephemeral client:
    https://docs.trychroma.com/docs/run-chroma/clients#in-memory-client
  - Chroma collection API:
    https://docs.trychroma.com/reference/python/client#get_or_create_collection
  - Chroma query API:
    https://docs.trychroma.com/docs/querying-collections/query-and-get#query
"""

from __future__ import annotations

import gc

import pytest

from telaios.core.rag_manager import RagManager
from telaios.core.types import (
    AgentInput,
    Message,
    MessageRole,
    RagConfig,
    RagStrategy,
    VectorStoreConfig,
)
from tests.helpers.fake_llm import FakeLLM

pytestmark = pytest.mark.integration

# ── Test documents ────────────────────────────────────────────────────────────

TEST_DOCUMENTS = [
    {
        "id": "doc1",
        "text": "Telaios is an AI orchestration platform for senior software engineers. "
        "It provides multi-agent workflows, RAG pipelines, and autonomous task execution.",
        "meta": {"source": "docs", "topic": "platform", "version": "1.0"},
    },
    {
        "id": "doc2",
        "text": "RAG (Retrieval-Augmented Generation) enhances LLM responses by retrieving "
        "relevant documents before generation. This reduces hallucination and grounds answers.",
        "meta": {"source": "docs", "topic": "rag", "version": "1.0"},
    },
    {
        "id": "doc3",
        "text": "Chroma is an open-source vector database for AI applications. "
        "It supports embeddings storage, metadata filtering, and similarity search.",
        "meta": {"source": "external", "topic": "chroma", "version": "1.5"},
    },
    {
        "id": "doc4",
        "text": "LangGraph enables stateful agent workflows with checkpointing and human-in-the-loop. "
        "It is built on top of LangChain and supports multi-agent orchestration.",
        "meta": {"source": "external", "topic": "langgraph", "version": "0.3"},
    },
    {
        "id": "doc5",
        "text": "Python 3.14 introduces deferred evaluation of annotations and improved error messages. "
        "These features make it easier to write type-safe code with fewer imports.",
        "meta": {"source": "external", "topic": "python", "version": "3.14"},
    },
    {
        "id": "doc6",
        "text": "The Telaios platform uses FastAPI for its web API layer, SQLAlchemy for database access, "
        "and Chroma for vector storage. It follows a modular monolith architecture.",
        "meta": {"source": "docs", "topic": "architecture", "version": "1.0"},
    },
]


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def rag_manager() -> RagManager:
    """Ephemeral Chroma client — no external container needed.

    Source: https://docs.trychroma.com/docs/run-chroma/clients#in-memory-client
    """
    manager = RagManager(
        vector_store=VectorStoreConfig(provider="chroma"),
    )
    return manager


@pytest.fixture
def populated_manager(rag_manager: RagManager) -> RagManager:
    """Manager pre-loaded with test documents."""
    ids = [d["id"] for d in TEST_DOCUMENTS]
    texts = [d["text"] for d in TEST_DOCUMENTS]
    metas = [d["meta"] for d in TEST_DOCUMENTS]
    rag_manager.ingest("test-rag", ids=ids, documents=texts, metadatas=metas)
    return rag_manager


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


# ── RagManager lifecycle tests ────────────────────────────────────────────────


class TestRagManagerLifecycle:
    """Client, collection CRUD, and ingestion."""

    def test_creates_ephemeral_client(self, rag_manager: RagManager) -> None:
        assert rag_manager.client is not None
        assert rag_manager.client.heartbeat() > 0

    def test_lists_collections_initially_empty(self, rag_manager: RagManager) -> None:
        assert rag_manager.list_collections() == []

    def test_creates_collection(self, rag_manager: RagManager) -> None:
        rag_manager.create_collection("test-coll")
        names = rag_manager.list_collections()
        assert "test-coll" in names

    def test_get_or_create_collection_idempotent(self, rag_manager: RagManager) -> None:
        c1 = rag_manager.get_or_create_collection("idem")
        c2 = rag_manager.get_or_create_collection("idem")
        assert c1.name == c2.name

    def test_deletes_collection(self, rag_manager: RagManager) -> None:
        rag_manager.create_collection("to-delete")
        rag_manager.delete_collection("to-delete")
        assert "to-delete" not in rag_manager.list_collections()

    def test_ingest_documents(self, populated_manager: RagManager) -> None:
        coll = populated_manager.get_or_create_collection("test-rag")
        assert coll.count() == len(TEST_DOCUMENTS)

    def test_upsert_documents(self, rag_manager: RagManager) -> None:
        rag_manager.upsert(
            "upsert-test",
            ids=["u1", "u2"],
            documents=["doc A", "doc B"],
        )
        # Upsert again — should not duplicate
        rag_manager.upsert(
            "upsert-test",
            ids=["u1", "u2"],
            documents=["doc A v2", "doc B v2"],
        )
        coll = rag_manager.get_or_create_collection("upsert-test")
        assert coll.count() == 2

    def test_delete_by_ids(self, populated_manager: RagManager) -> None:
        coll = populated_manager.get_or_create_collection("test-rag")
        before = coll.count()
        populated_manager.delete_documents("test-rag", ids=["doc1"])
        assert coll.count() == before - 1

    def test_collection_deleted_after_manager_reset(self, rag_manager: RagManager) -> None:
        """Chroma ephemeral client may disable reset(); verify delete works."""
        rag_manager.create_collection("will-be-gone")
        try:
            rag_manager.reset()
            assert rag_manager.list_collections() == []
        except Exception:
            # Ephemeral client disables reset — clean up manually
            rag_manager.delete_collection("will-be-gone")
            assert "will-be-gone" not in rag_manager.list_collections()

    def test_cleanup(self, rag_manager: RagManager) -> None:
        """Clean up any collections created during the test suite."""
        import contextlib

        try:
            rag_manager.reset()
        except Exception:
            for name in rag_manager.list_collections():
                with contextlib.suppress(Exception):
                    rag_manager.delete_collection(name)
        gc.collect()


# ── ChromaRetriever tests ─────────────────────────────────────────────────────


class TestChromaRetriever:
    """Vector similarity retrieval via Chroma collection."""

    def test_retrieve_returns_chunks(self, populated_manager: RagManager) -> None:
        retriever = populated_manager.create_retriever("test-rag")
        from telaios.core.types import RetrievalQuery

        result = retriever.retrieve(RetrievalQuery(text="What is Telaios?", top_k=3))
        assert len(result.chunks) == 3
        assert all(chunk.content for chunk in result.chunks)
        # Top result should be about Telaios (doc1)
        top_texts = [c.content[:50] for c in result.chunks]
        assert any("Telaios" in t for t in top_texts)

    def test_retrieve_with_metadata_filter(self, populated_manager: RagManager) -> None:
        retriever = populated_manager.create_retriever("test-rag")
        from telaios.core.types import RetrievalQuery

        result = retriever.retrieve(
            RetrievalQuery(
                text="platform",
                top_k=5,
                filters={"source": "docs"},
            )
        )
        # Only docs with source="docs" should be returned
        for chunk in result.chunks:
            assert chunk.metadata.get("source") == "docs"

    def test_retrieve_top_k_limit(self, populated_manager: RagManager) -> None:
        retriever = populated_manager.create_retriever("test-rag")
        from telaios.core.types import RetrievalQuery

        result = retriever.retrieve(RetrievalQuery(text="AI", top_k=1))
        assert len(result.chunks) == 1

    def test_async_retrieve(self, populated_manager: RagManager) -> None:
        import asyncio

        retriever = populated_manager.create_retriever("test-rag")
        from telaios.core.types import RetrievalQuery

        async def _run() -> None:
            result = await retriever.aretrieve(RetrievalQuery(text="database", top_k=2))
            assert len(result.chunks) == 2

        asyncio.run(_run())


# ── RAG Strategy E2E tests ────────────────────────────────────────────────────


class TestSimpleRAG:
    """SIMPLE strategy: retrieve → prepend context → answer."""

    def test_answer_with_context(self, populated_manager: RagManager, fake_llm: FakeLLM) -> None:
        import asyncio

        pipeline = populated_manager.create_pipeline(
            RagConfig(strategy=RagStrategy.SIMPLE, top_k=3),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="test-rag",
        )

        async def _run() -> None:
            output = await pipeline.answer(
                AgentInput(messages=[Message(role=MessageRole.HUMAN, content="What is Telaios?")])
            )
            assert "FakeLLM" in output.content
            assert len(output.messages) > 0

        asyncio.run(_run())

    def test_answer_with_no_context_found(self, rag_manager: RagManager, fake_llm: FakeLLM) -> None:
        import asyncio

        rag_manager.ingest(
            "empty",
            ids=["e1"],
            documents=["Unrelated content about weather."],
        )
        pipeline = rag_manager.create_pipeline(
            RagConfig(strategy=RagStrategy.SIMPLE, top_k=1),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="empty",
        )

        async def _run() -> None:
            output = await pipeline.answer(
                AgentInput(
                    messages=[
                        Message(
                            role=MessageRole.HUMAN,
                            content="What is quantum computing?",
                        )
                    ]
                )
            )
            assert "FakeLLM" in output.content

        asyncio.run(_run())


class TestHybridRAG:
    """HYBRID strategy: multi-retriever fusion via RRF."""

    def test_hybrid_retrieval_fusion(
        self, populated_manager: RagManager, fake_llm: FakeLLM
    ) -> None:
        import asyncio

        # Create a second collection for BM25-like retrieval
        populated_manager.ingest(
            "test-rag_bm25",
            ids=[d["id"] for d in TEST_DOCUMENTS],
            documents=[d["text"] for d in TEST_DOCUMENTS],
            metadatas=[d["meta"] for d in TEST_DOCUMENTS],
        )

        pipeline = populated_manager.create_pipeline(
            RagConfig(strategy=RagStrategy.HYBRID, top_k=3, extra={"rrf_k": 60}),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="test-rag",
        )

        async def _run() -> None:
            output = await pipeline.answer(
                AgentInput(
                    messages=[
                        Message(role=MessageRole.HUMAN, content="Tell me about RAG pipelines.")
                    ]
                )
            )
            assert "FakeLLM" in output.content

        asyncio.run(_run())


class TestAgenticRAG:
    """AGENTIC strategy: iterative retrieval with reflection."""

    def test_agentic_retrieval_loop(self, populated_manager: RagManager, fake_llm: FakeLLM) -> None:
        import asyncio

        pipeline = populated_manager.create_pipeline(
            RagConfig(strategy=RagStrategy.AGENTIC, top_k=2, extra={"max_retrieval_rounds": 3}),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="test-rag",
        )

        async def _run() -> None:
            output = await pipeline.answer(
                AgentInput(
                    messages=[
                        Message(
                            role=MessageRole.HUMAN,
                            content="How does Telaios use Chroma and LangGraph?",
                        )
                    ]
                )
            )
            assert "FakeLLM" in output.content

        asyncio.run(_run())


class TestGraphRAG:
    """GRAPH strategy: knowledge graph traversal for structured context."""

    def test_graph_rag_with_in_memory_store(
        self, populated_manager: RagManager, fake_llm: FakeLLM
    ) -> None:
        import asyncio

        pipeline = populated_manager.create_pipeline(
            RagConfig(strategy=RagStrategy.GRAPH, top_k=5),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="test-rag",
        )

        async def _run() -> None:
            output = await pipeline.answer(
                AgentInput(
                    messages=[
                        Message(
                            role=MessageRole.HUMAN,
                            content="How are the components related?",
                        )
                    ]
                )
            )
            assert "FakeLLM" in output.content

        asyncio.run(_run())


class TestCRAG:
    """CRAG strategy: grade, rewrite, fallback."""

    def test_crag_with_document_grading(
        self, populated_manager: RagManager, fake_llm: FakeLLM
    ) -> None:
        import asyncio

        pipeline = populated_manager.create_pipeline(
            RagConfig(
                strategy=RagStrategy.CRAG,
                top_k=3,
                extra={"max_rewrite_attempts": 1},
            ),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="test-rag",
        )

        async def _run() -> None:
            output = await pipeline.answer(
                AgentInput(
                    messages=[
                        Message(
                            role=MessageRole.HUMAN,
                            content="Explain the RAG pipeline architecture.",
                        )
                    ]
                )
            )
            assert "FakeLLM" in output.content

        asyncio.run(_run())


class TestSelfRAG:
    """Self-RAG strategy: generate, reflect, regenerate."""

    def test_self_rag_with_reflection(
        self, populated_manager: RagManager, fake_llm: FakeLLM
    ) -> None:
        import asyncio

        pipeline = populated_manager.create_pipeline(
            RagConfig(
                strategy=RagStrategy.SELF_RAG,
                top_k=3,
                extra={"max_regeneration_rounds": 1},
            ),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="test-rag",
        )

        async def _run() -> None:
            output = await pipeline.answer(
                AgentInput(
                    messages=[
                        Message(
                            role=MessageRole.HUMAN,
                            content="What is Telaios built with?",
                        )
                    ]
                )
            )
            assert "FakeLLM" in output.content

        asyncio.run(_run())


# ── Full E2E pipeline test ────────────────────────────────────────────────────


class TestFullE2EPipeline:
    """End-to-end: create manager → ingest → pipeline → answer → verify.

    This is the canonical usage pattern intended for TUI, CLI, and webapp.
    """

    def test_full_e2e_with_multiple_queries(
        self, rag_manager: RagManager, fake_llm: FakeLLM
    ) -> None:
        import asyncio

        # 1. Ingest
        rag_manager.ingest(
            "e2e",
            ids=[d["id"] for d in TEST_DOCUMENTS],
            documents=[d["text"] for d in TEST_DOCUMENTS],
            metadatas=[d["meta"] for d in TEST_DOCUMENTS],
        )

        # 2. Create pipeline
        pipeline = rag_manager.create_pipeline(
            RagConfig(strategy=RagStrategy.SIMPLE, top_k=3),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="e2e",
        )

        queries = [
            "What is Telaios?",
            "How does RAG work?",
            "What vector database does Telaios use?",
        ]

        async def _run() -> None:
            for query in queries:
                output = await pipeline.answer(
                    AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
                )
                assert "FakeLLM" in output.content
                assert len(output.messages) == 1

        asyncio.run(_run())

    def test_e2e_streaming(self, populated_manager: RagManager, fake_llm: FakeLLM) -> None:
        import asyncio

        pipeline = populated_manager.create_pipeline(
            RagConfig(strategy=RagStrategy.SIMPLE, top_k=3),
            llm=fake_llm,  # type: ignore[arg-type]
            collection_name="test-rag",
        )

        async def _run() -> None:
            from telaios.core.types import StreamEventType

            events = []
            async for event in pipeline.astream(
                AgentInput(messages=[Message(role=MessageRole.HUMAN, content="Hello")])
            ):
                events.append(event)

            # Should have AGENT_START, TEXT_CHUNK(s), AGENT_END
            event_types = [e.type for e in events]
            assert StreamEventType.AGENT_START in event_types
            assert StreamEventType.AGENT_END in event_types
            assert any(e.type == StreamEventType.TEXT_CHUNK for e in events)

        asyncio.run(_run())
