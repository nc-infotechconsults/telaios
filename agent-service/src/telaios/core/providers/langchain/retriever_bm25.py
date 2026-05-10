"""
src/core/providers/langchain/retriever_bm25.py
----------------------------------------------
LangChain-backed BM25 (sparse) retriever implementation.

Uses LangChain's BM25Retriever from langchain_community.retrievers,
which wraps the rank_bm25 package.

Sources
~~~~~~~
- LangChain BM25Retriever:
  https://python.langchain.com/docs/integrations/retrievers/bm25/
- rank_bm25 package: https://github.com/dorianbrown/rank_bm25
"""

from __future__ import annotations

import hashlib
import logging
from typing import TYPE_CHECKING, Any

from telaios.core.rag import Retriever
from telaios.core.types import Chunk, RetrievalQuery, RetrievalResult

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class BM25Retriever(Retriever):
    """
    Sparse retrieval using BM25 ranking algorithm.

    BM25 is a bag-of-words retrieval function that ranks documents
    based on term frequency and inverse document frequency. It does NOT
    use embeddings, making it useful for:
    - Exact keyword matching
    - Combinations with dense retrievers (HYBRID strategy)
    - Scenarios where embeddings are unavailable

    Args:
        chunks: List of ``Chunk`` objects to index. The retriever builds
                an inverted index over the chunk contents.
        top_k: Default number of results to return (can be overridden per-query).
        preprocess_func: Optional tokenization function. If not provided,
                        uses simple whitespace splitting.
        variant: BM25 variant - "okapi" (default) or "plus" (better for short texts).
        bm25_params: Additional BM25 parameters (k1, b for Okapi, delta for Plus).

    Source: LangChain BM25Retriever usage pattern -
    https://python.langchain.com/docs/integrations/retrievers/bm25/
    """

    def __init__(
        self,
        chunks: list[Chunk],
        top_k: int = 5,
        preprocess_func: Any = None,
        variant: str = "okapi",
        bm25_params: dict[str, Any] | None = None,
    ) -> None:
        self._chunks = chunks
        self._top_k = top_k
        self._preprocess_func = preprocess_func
        self._variant = variant
        self._bm25_params = bm25_params or {}
        self._lc_retriever: Any | None = None
        self._build_retriever()

    def _build_retriever(self) -> None:
        """Build the internal LangChain BM25Retriever."""
        try:
            from langchain_community.retrievers import BM25Retriever as LcBM25Retriever
            from langchain_core.documents import Document
        except ImportError as exc:
            raise ImportError(
                "BM25Retriever requires langchain-community and rank-bm25. "
                "Install with: pip install langchain-community rank-bm25"
            ) from exc

        lc_docs = [
            Document(page_content=chunk.content, metadata=chunk.metadata)
            for chunk in self._chunks
        ]

        self._lc_retriever = LcBM25Retriever.from_documents(
            lc_docs,
            preprocess_func=self._preprocess_func,
            k=self._top_k,
            bm25_variant=self._variant,
            bm25_params=self._bm25_params,
        )

    def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Synchronous retrieval via LangChain's BM25Retriever."""
        if self._lc_retriever is None:
            self._build_retriever()

        lc_docs = self._lc_retriever.get_relevant_documents(query.text)
        return self._to_result(lc_docs)

    async def aretrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Asynchronous retrieval via LangChain's BM25Retriever."""
        if self._lc_retriever is None:
            self._build_retriever()

        lc_docs = await self._lc_retriever.aget_relevant_documents(query.text)
        return self._to_result(lc_docs)

    @staticmethod
    def _to_result(lc_docs: list[Any]) -> RetrievalResult:
        """Convert LangChain Document objects to RetrievalResult."""
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


class BM25RetrieverFactory:
    """
    Factory for creating BM25 retrievers with configuration.

    Supports both in-memory index (from chunks) and loading from existing indexes.
    """

    @staticmethod
    def create_from_chunks(
        chunks: list[Chunk],
        top_k: int = 5,
        preprocess_func: Any = None,
        variant: str = "okapi",
        bm25_params: dict[str, Any] | None = None,
    ) -> BM25Retriever:
        """
        Create a BM25 retriever from a list of chunks.

        Args:
            chunks: Documents to index.
            top_k: Default result count.
            preprocess_func: Tokenization function.
            variant: "okapi" or "plus".
            bm25_params: Additional BM25 parameters.

        Returns:
            Configured ``BM25Retriever`` instance.
        """
        return BM25Retriever(
            chunks=chunks,
            top_k=top_k,
            preprocess_func=preprocess_func,
            variant=variant,
            bm25_params=bm25_params,
        )