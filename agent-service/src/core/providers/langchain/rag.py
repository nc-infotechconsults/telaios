"""
src/core/providers/langchain/rag.py
------------------------------------
Thin LangChain wiring layer for RAG strategies.

This module wires the provider-agnostic strategies from ``core/strategies/``
to LangChain-specific implementations:
- ``LangChainLLM`` wraps LangChain's BaseChatModel
- LangChain retrievers (BM25, vector store, etc.)

The strategy logic itself lives in ``core/strategies/`` and contains
zero LangChain imports.

Sources
~~~~~~~
- LangChain RAG guide: https://docs.langchain.com/oss/python/langchain/rag
- LangChain BaseRetriever:
  https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/retrievers.py
"""

from __future__ import annotations

import hashlib
import logging
from typing import TYPE_CHECKING, Any, AsyncIterator

from core.llm import LLM
from core.providers.langchain.llm import LangChainLLM
from core.rag import RAG, Retriever
from core.strategies.agentic import AgenticRAG
from core.strategies.crag import CRAG
from core.strategies.graph import GraphRAG
from core.strategies.hybrid import HybridRAG
from core.strategies.self_rag import SelfRAG
from core.strategies.simple import SimpleRAG
from core.types import (
    AgentConfig,
    AgentInput,
    AgentOutput,
    Chunk,
    Message,
    MessageRole,
    RagConfig,
    RetrievalQuery,
    RetrievalResult,
    StreamEvent,
    StreamEventType,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ── LangChainRetriever (existing wrapper) ────────────────────────────────────


class LangChainRetriever(Retriever):
    """
    ``Retriever`` backed by a LangChain ``BaseRetriever``.

    Source:
        https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/retrievers.py
    """

    def __init__(self, lc_retriever: Any) -> None:
        self._lc_retriever = lc_retriever

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        lc_docs = self._lc_retriever.get_relevant_documents(query.text)
        return self._to_result(lc_docs)

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        lc_docs = await self._lc_retriever.aget_relevant_documents(query.text)
        return self._to_result(lc_docs)

    @staticmethod
    def _to_result(lc_docs: list[Any]) -> RetrievalResult:
        chunks: list[Chunk] = []
        for doc in lc_docs:
            doc_id = doc.metadata.get("source", "unknown")
            chunk_id = hashlib.md5(doc.page_content.encode()).hexdigest()  # noqa: S324
            chunks.append(
                Chunk(
                    id=chunk_id,
                    document_id=doc_id,
                    content=doc.page_content,
                    metadata=dict(doc.metadata),
                )
            )
        return RetrievalResult(chunks=chunks)


# ── LangChainRAG (unified dispatcher) ────────────────────────────────────────


class LangChainRAG(RAG):
    """
    Unified LangChain RAG dispatcher.

    Wires the appropriate provider-agnostic strategy from ``core/strategies/``
    with a ``LangChainLLM`` and the configured retriever(s).
    """

    def __init__(self, retriever: Retriever, config: RagConfig) -> None:
        super().__init__(retriever, config)

        if config.llm is None:
            raise ValueError("RAG requires RagConfig.llm to be set.")

        # Create the LLM adapter
        self._llm = LangChainLLM(config.llm)

        # Select and instantiate the appropriate strategy
        from core.types import RagStrategy

        if config.strategy == RagStrategy.GRAPH:
            from core.graph_store import GraphStore
            from core.providers.networkx.graph_store import NetworkXGraphStore
            from core.providers.neo4j.graph_store import Neo4jGraphStore

            if config.graph_store is None:
                graph_store = NetworkXGraphStore(
                    type("GraphStoreConfig", (), {"provider": "networkx", "extra": {}})()
                )
            elif config.graph_store.provider == "neo4j":
                graph_store = Neo4jGraphStore(config.graph_store)
            else:
                graph_store = NetworkXGraphStore(config.graph_store)

            self._strategy = GraphRAG(retriever, self._llm, config, graph_store)

        elif config.strategy == RagStrategy.HYBRID:
            extra_retrievers = config.extra.get("extra_retrievers", []) if config.extra else []
            all_retrievers = [retriever] + extra_retrievers
            self._strategy = HybridRAG(retriever, self._llm, config, all_retrievers)

        elif config.strategy == RagStrategy.AGENTIC:
            self._strategy = AgenticRAG(retriever, self._llm, config)

        elif config.strategy == RagStrategy.CRAG:
            self._strategy = CRAG(retriever, self._llm, config)

        elif config.strategy == RagStrategy.SELF_RAG:
            self._strategy = SelfRAG(retriever, self._llm, config)

        else:
            self._strategy = SimpleRAG(retriever, self._llm, config)

    # ── Delegate to strategy ─────────────────────────────────────────────

    async def answer(self, input: AgentInput) -> AgentOutput:
        return await self._strategy.answer(input)

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
        async for event in self._strategy.astream(input):
            yield event


# ── LangChainSimpleRAG (backward compatibility) ──────────────────────────────


class LangChainSimpleRAG(RAG):
    """
    SIMPLE (retrieve-then-read) RAG strategy — backward compatible alias.

    Delegates to the unified LangChainRAG with SIMPLE strategy.
    """

    def __init__(self, retriever: Retriever, config: RagConfig) -> None:
        from core.types import RagStrategy

        simple_config = RagConfig(
            strategy=RagStrategy.SIMPLE,
            llm=config.llm,
            embedding=config.embedding,
            vector_store=config.vector_store,
            top_k=config.top_k,
            framework=config.framework,
        )
        self._delegate = LangChainRAG(retriever, simple_config)

    async def answer(self, input: AgentInput) -> AgentOutput:
        return await self._delegate.answer(input)

    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
        async for event in self._delegate.astream(input):
            yield event
