"""
src/core/retriever.py
---------------------
Retriever abstraction for RAG strategies.

``Retriever`` defines the interface that concrete retriever implementations
must fulfill.  It is used by ``core/strategies/`` as a type annotation.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from telaios.core.types import RetrievalQuery, RetrievalResult


class Retriever(ABC):
    """
    Abstract base class for any retrieval backend.

    Implementations may wrap a vector database, graph database, BM25 index,
    hybrid search engine, or web-search API.  Pass any subclass to the RAG
    strategy constructors in ``core/strategies/``.
    """

    @abstractmethod
    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Synchronously retrieve relevant chunks for *query*."""
        ...

    @abstractmethod
    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Asynchronously retrieve relevant chunks for *query*."""
        ...
