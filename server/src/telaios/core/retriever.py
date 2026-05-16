"""
src/core/retriever.py
---------------------
Retriever abstraction for RAG strategies.

``Retriever`` is a simple base class (not an ABC) that concrete retriever
implementations extend.  It is used only by ``core/strategies/`` as a type
annotation — callers pass any object with ``retrieve`` / ``aretrieve`` methods.
"""

from __future__ import annotations

from telaios.core.types import RetrievalQuery, RetrievalResult


class Retriever:
    """
    Base class for any retrieval backend.

    Implementations may wrap a vector database, graph database, BM25 index,
    hybrid search engine, or web-search API.  Pass any subclass to the RAG
    strategy constructors in ``core/strategies/``.
    """

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:  # pragma: no cover
        raise NotImplementedError

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:  # pragma: no cover
        raise NotImplementedError
