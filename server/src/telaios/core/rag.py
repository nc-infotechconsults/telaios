"""
src/core/rag.py
---------------
Framework-agnostic RAG (Retrieval-Augmented Generation) abstractions.

This module defines only the ``Retriever`` and ``RAG`` abstract base classes.
Concrete implementations live under ``core/providers/``.

To obtain a retriever or RAG instance, use the factory::

    from core.factory import create_retriever, create_rag
    from core.types import RagConfig, EmbeddingConfig, VectorStoreConfig

    retriever = create_retriever(config)
    rag = create_rag(config)

No LangChain or any other framework symbol is part of the public API.

Strategies (implemented by concrete providers)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
SIMPLE   — one-shot retrieve → prepend context → LLM answer
GRAPH    — knowledge-graph traversal → structured sub-graph context → LLM
AGENTIC  — agent loop decides when/what to retrieve (multi-hop)
HYBRID   — vector similarity + graph traversal combined

Sources
~~~~~~~
- LangChain RAG guide: https://docs.langchain.com/oss/python/langchain/rag
- Neo4j Graph RAG with LangChain:
  https://neo4j.com/blog/developer/rag-tutorial/
- LangChain BaseRetriever:
  https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/retrievers.py
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from telaios.core.types import (
    AgentInput,
    AgentOutput,
    RagConfig,
    RetrievalQuery,
    RetrievalResult,
    StreamEvent,
)

# ── Retriever contract ────────────────────────────────────────────────────────


class Retriever(ABC):
    """
    Framework-agnostic interface for any retrieval backend.

    Implementations may wrap:
    - A vector database (pgvector, Chroma, Qdrant, …)
    - A graph database (Neo4j, Memgraph, …)
    - A hybrid search engine
    - A web-search API
    - LangChain's ``BaseRetriever`` (see ``LangChainRetriever`` in providers)

    Callers depend only on this interface; they never import a concrete class.
    """

    @abstractmethod
    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Synchronously retrieve relevant chunks for *query*."""
        ...

    @abstractmethod
    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Asynchronously retrieve relevant chunks for *query*."""
        ...


# ── RAG contract ──────────────────────────────────────────────────────────────


class RAG(ABC):
    """
    Framework-agnostic interface for a Retrieval-Augmented Generation system.

    A ``RAG`` holds a ``Retriever`` and uses it in combination with an LLM to
    answer questions.  Concrete classes implement one of the four strategies
    documented in the module docstring (SIMPLE, GRAPH, AGENTIC, HYBRID).

    All four strategies share this same interface, making it trivial to swap
    strategies at configuration time without touching calling code.
    """

    def __init__(self, retriever: Retriever, config: RagConfig) -> None:
        self.retriever = retriever
        self.config = config

    @abstractmethod
    async def answer(self, input: AgentInput) -> AgentOutput:
        """Answer a question, using retrieval to augment the LLM response."""
        ...

    @abstractmethod
    async def astream(self, input: AgentInput) -> AsyncIterator[StreamEvent]:
        """
        Stream the answering process.

        Yields ``StreamEvent`` objects; implementations are expected to emit
        at minimum a ``AGENT_START``, one or more ``TEXT_CHUNK`` events, and
        ``AGENT_END``.
        """
        ...
        yield  # type: ignore[misc]  # marks this as an async generator
