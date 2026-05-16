"""
core/chroma_retriever.py — Chroma-backed Retriever.

Implements the ``Retriever`` ABC using Chroma's native ``collection.query()``
API.  Works with any Chroma client (ephemeral, persistent, HTTP, cloud).

Sources:
  - Chroma collection.query():
    https://docs.trychroma.com/docs/querying-collections/query-and-get#query
  - Chroma collection query result shape (column-major):
    https://docs.trychroma.com/reference/python/collection#queryresult
  - Metadata filtering:
    https://docs.trychroma.com/docs/querying-collections/metadata-filtering
"""

from __future__ import annotations

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
    """Vector-similarity retriever backed by a Chroma collection.

    Implements both ``retrieve()`` (sync) and ``aretrieve()`` (async) via
    Chroma's built-in client APIs.

    Usage::

        client = chromadb.Client()
        collection = client.get_or_create_collection("my-rag")
        retriever = ChromaRetriever(collection)
        result = retriever.retrieve(RetrievalQuery(text="...", top_k=5))
    """

    def __init__(
        self,
        collection: Any,  # chromadb.Collection
        *,
        embedding_function: ChromaEmbeddingFunction | None = None,
    ) -> None:
        self._collection = collection
        self._ef = embedding_function

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Synchronous similarity search via Chroma ``collection.query()``."""
        return self._run_query(query)

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Async similarity search — delegates to sync Chroma API.

        Note: Chroma's Python client is synchronous; for true async use
        ``chromadb.AsyncHttpClient``.
        """
        return self._run_query(query)

    # --- internal -------------------------------------------------------

    def _run_query(self, query: RetrievalQuery) -> RetrievalResult:
        q_kwargs: dict[str, Any] = {"n_results": query.top_k}

        if query.text:
            q_kwargs["query_texts"] = [query.text]
        if query.filters:
            q_kwargs["where"] = query.filters

        results = self._collection.query(
            **q_kwargs,
            include=["documents", "metadatas", "distances"],
        )

        return self._to_retrieval_result(results)

    @staticmethod
    def _to_retrieval_result(raw: dict[str, Any]) -> RetrievalResult:
        """Convert Chroma's column-major QueryResult to ``RetrievalResult``.

        Chroma returns batches (one per query text). We unwrap the first batch.
        """
        chunks: list[Chunk] = []
        scores: list[float] = []

        ids = raw.get("ids", [[]])[0]
        documents = raw.get("documents", [None])[0] or []
        metadatas = raw.get("metadatas", [None])[0] or []
        distances = raw.get("distances", [None])[0] or []

        for i, doc_id in enumerate(ids):
            doc_text = documents[i] if i < len(documents) else ""
            meta = metadatas[i] if i < len(metadatas) else {}
            if meta is None:
                meta = {}

            distance = distances[i] if i < len(distances) else 1.0
            # Chroma returns L2/cosine distance; convert to similarity score
            score = 1.0 / (1.0 + float(distance)) if distance else 1.0

            chunks.append(
                Chunk(
                    id=doc_id,
                    document_id=meta.get("document_id", doc_id),
                    content=doc_text or "",
                    metadata=meta,
                )
            )
            scores.append(score)

        return RetrievalResult(chunks=chunks, scores=scores)


def create_chroma_client(config: VectorStoreConfig) -> ClientAPI:
    """Create a Chroma client from ``VectorStoreConfig``.

    Providers:
      - ``chroma`` (ephemeral, in-memory)  — for testing/dev
      - ``chroma:persistent``               — local disk-backed
      - ``chroma:http``                     — remote Chroma server

    Sources:
      - Chroma clients:
        https://docs.trychroma.com/docs/run-chroma/clients
      - EphemeralClient:
        https://docs.trychroma.com/reference/python/client#ephemeralclient
      - PersistentClient:
        https://docs.trychroma.com/reference/python/client#persistentclient
      - HttpClient:
        https://docs.trychroma.com/reference/python/client#httpclient
    """
    import chromadb

    provider = config.provider.lower()

    if provider == "chroma":
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

    # Default: ephemeral in-memory
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

    # Async wrapper not needed for ephemeral — just return sync client
    return chromadb.Client()
