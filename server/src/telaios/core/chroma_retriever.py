"""
core/chroma_retriever.py — Chroma-backed Retriever via LangChain integration.

Implements the ``Retriever`` ABC using ``langchain_chroma.Chroma`` — the
official LangChain Chroma integration. This gives us:

  - ``similarity_search()`` / ``similarity_search_with_score()``
  - ``as_retriever()`` → LangChain-native ``BaseRetriever`` for chains/agents
  - MMR search, metadata filtering, LangSmith tracing

Sources:
  - LangChain Chroma integration:
    https://python.langchain.com/docs/integrations/vectorstores/chroma
  - ``langchain_chroma.Chroma`` API reference:
    https://reference.langchain.com/python/langchain-chroma/vectorstores/Chroma
  - Chroma clients (ephemeral/persistent/HTTP/cloud):
    https://docs.trychroma.com/docs/run-chroma/clients
"""

from __future__ import annotations

import os
from typing import Any

from chromadb.api import ClientAPI

from telaios.core.chroma_embedding import ChromaEmbeddingFunction
from telaios.core.retriever import Retriever
from telaios.core.types import (
    Chunk,
    RetrievalQuery,
    RetrievalResult,
    VectorStoreConfig,
)


class ChromaRetriever(Retriever):
    """Vector-similarity retriever backed by ``langchain_chroma.Chroma``.

    Uses the official LangChain Chroma integration for all retrieval
    operations. Provides both our internal ``Retriever`` interface and
    a LangChain-native ``as_langchain_retriever()`` for chains.

    Source:
      https://python.langchain.com/docs/integrations/vectorstores/chroma#query-by-turning-into-retriever

    Usage::

        client = chromadb.Client()
        retriever = ChromaRetriever.from_client(client, "my-rag")
        result = retriever.retrieve(RetrievalQuery(text="...", top_k=5))

        # Or for LangChain chains/agents:
        lc_retriever = retriever.as_langchain_retriever()
        docs = lc_retriever.invoke("query")
    """

    def __init__(
        self,
        vector_store: Any,  # langchain_chroma.Chroma
        *,
        collection_name: str = "",
    ) -> None:
        self._vs = vector_store
        self._collection_name = collection_name

    # -- factory from chromadb client (recommended) -------------------------------

    @classmethod
    def from_client(
        cls,
        client: ClientAPI,
        collection_name: str,
        *,
        embedding_function: Any | None = None,
    ) -> ChromaRetriever:
        """Create from an existing chromadb client.

        The collection's built-in embedding function is used by default.
        Pass ``embedding_function`` to override with a LangChain ``Embeddings``.

        Source:
          https://python.langchain.com/docs/integrations/vectorstores/chroma#initialization-from-client
        """
        from langchain_chroma import Chroma

        vs = Chroma(
            client=client,
            collection_name=collection_name,
            embedding_function=embedding_function,
        )
        return cls(vs, collection_name=collection_name)

    @classmethod
    def from_collection(
        cls,
        collection: Any,  # chromadb.Collection
        *,
        collection_name: str = "",
        embedding_function: ChromaEmbeddingFunction | None = None,
    ) -> ChromaRetriever:
        """Create from a bare chromadb Collection (no client reference).

        ``embedding_function`` is not passed — the collection already has one.
        """
        from langchain_chroma import Chroma

        vs = Chroma(
            client=collection._client,
            collection_name=collection_name or collection.name,
            embedding_function=None,
        )
        return cls(vs, collection_name=collection_name or collection.name)

    # -- Retriever ABC -------------------------------------------------------

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Synchronous similarity search via LangChain Chroma integration.

        Source:
          https://python.langchain.com/docs/integrations/vectorstores/chroma#similarity-search
        """
        return self._run_search(query)

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Async similarity search — delegates to sync LangChain Chroma API."""
        return self._run_search(query)

    # -- LangChain-native access -------------------------------------------------

    def as_langchain_retriever(
        self,
        *,
        search_type: str = "similarity",
        search_kwargs: dict[str, Any] | None = None,
    ) -> Any:
        """Return a LangChain ``BaseRetriever`` for use in chains and agents.

        Source:
          https://python.langchain.com/docs/integrations/vectorstores/chroma#query-by-turning-into-retriever

        Args:
            search_type: ``"similarity"``, ``"mmr"``, or ``"similarity_score_threshold"``
            search_kwargs: e.g. ``{"k": 5, "fetch_k": 10}``

        Returns:
            A LangChain ``VectorStoreRetriever`` instance.
        """
        kwargs = search_kwargs or {}
        return self._vs.as_retriever(search_type=search_type, search_kwargs=kwargs)

    @property
    def vector_store(self) -> Any:
        """The underlying ``langchain_chroma.Chroma`` instance."""
        return self._vs

    # -- internal ----------------------------------------------------------------

    def _run_search(self, query: RetrievalQuery) -> RetrievalResult:
        filter_dict: dict[str, Any] | None = None
        if query.filters:
            filter_dict = query.filters

        # Use the LangChain Chroma API for similarity search with scores
        results_with_scores = self._vs.similarity_search_with_score(
            query.text,
            k=query.top_k,
            filter=filter_dict,
        )

        chunks: list[Chunk] = []
        scores: list[float] = []
        for doc, score in results_with_scores:
            # LangChain Chroma returns distance (lower = closer);
            # convert to similarity score
            sim = 1.0 / (1.0 + score)
            meta = dict(doc.metadata) if doc.metadata else {}
            chunks.append(
                Chunk(
                    id=meta.get("id", doc.id or ""),
                    document_id=meta.get("document_id", ""),
                    content=doc.page_content,
                    metadata=meta,
                )
            )
            scores.append(sim)

        return RetrievalResult(chunks=chunks, scores=scores)


# -- Client factory (unchanged from original) ----------------------------------


def create_chroma_client(config: VectorStoreConfig) -> ClientAPI:
    """Create a Chroma client from ``VectorStoreConfig``.

    Source:
      https://docs.trychroma.com/docs/run-chroma/clients
    """
    import chromadb

    provider = config.provider.lower()

    if provider == "chroma":
        if os.environ.get("CHROMA_HOST"):
            host = os.environ["CHROMA_HOST"]
            port = int(os.environ.get("CHROMA_PORT", "8000"))
            return chromadb.HttpClient(host=host, port=port)
        return chromadb.Client()

    if provider == "chroma:persistent":
        path = config.connection_string or "./chroma_data"
        return chromadb.PersistentClient(path=path)

    if provider == "chroma:http":
        host = config.extra.get("host", "localhost")
        port = config.extra.get("port", 8000)
        ssl = config.extra.get("ssl", False)
        return chromadb.HttpClient(host=host, port=port, ssl=ssl)

    if provider == "chroma:cloud":
        return chromadb.CloudClient(
            api_key=config.extra.get("api_key"),
            tenant=config.extra.get("tenant"),
            database=config.extra.get("database"),
        )

    return chromadb.Client()


async def create_chroma_client_async(config: VectorStoreConfig) -> Any:
    """Create an async Chroma client for non-blocking use.

    Source:
      https://docs.trychroma.com/reference/python/client#asynchttpclient
    """
    import chromadb

    provider = config.provider.lower()

    if provider in ("chroma:http", "chroma:cloud"):
        host = config.extra.get("host", "localhost")
        port = config.extra.get("port", 8000)
        ssl = config.extra.get("ssl", False)
        return await chromadb.AsyncHttpClient(host=host, port=port, ssl=ssl)

    return chromadb.Client()
