"""
core/rag_manager.py — Central RAG pipeline management.

Owns Chroma client lifecycle, collection management, and strategy wiring.
Replaces ad-hoc ``create_retriever()`` functions scattered across modules.

Sources:
  - Chroma collection management:
    https://docs.trychroma.com/docs/collections/manage-collections
  - Embedding functions:
    https://docs.trychroma.com/docs/embeddings/embedding-functions
  - Clients (ephemeral/persistent/HTTP/cloud):
    https://docs.trychroma.com/docs/run-chroma/clients
"""

from __future__ import annotations

import logging
from typing import Any

from chromadb.api import ClientAPI

from telaios.core.chroma_embedding import ChromaEmbeddingFunction
from telaios.core.chroma_retriever import ChromaRetriever, create_chroma_client
from telaios.core.llm import LLM
from telaios.core.strategies import RAGStrategy
from telaios.core.strategies.agentic import AgenticRAG
from telaios.core.strategies.crag import CRAG
from telaios.core.strategies.graph import GraphRAG
from telaios.core.strategies.hybrid import HybridRAG
from telaios.core.strategies.self_rag import SelfRAG
from telaios.core.strategies.simple import SimpleRAG
from telaios.core.types import EmbeddingConfig, RagConfig, VectorStoreConfig
from telaios.core.types import RagStrategy as RagStrategyEnum

logger = logging.getLogger(__name__)


class RagManager:
    """Central manager for RAG pipelines backed by Chroma.

    Owns the Chroma client, creates collections on demand, and wires up
    retriever + LLM into any of the 6 supported strategies.

    Usage::

        manager = RagManager(
            vector_store=VectorStoreConfig(provider="chroma"),
            embedding=EmbeddingConfig(provider="sentence_transformers"),
        )
        pipeline = manager.create_pipeline(
            RagConfig(strategy=RagStrategy.SIMPLE),
            llm=my_llm,
        )
        response = await pipeline.answer(input)

    The manager is designed to be:
      - Singleton per application instance (one Chroma client)
      - Collection-aware (one per RAG context/namespace)
      - Strategy-agnostic (delegates to strategy implementations)
      - Exportable via TUI, CLI, and webapp (same manager, different frontends)
    """

    def __init__(
        self,
        *,
        vector_store: VectorStoreConfig | None = None,
        embedding: EmbeddingConfig | None = None,
        client: ClientAPI | None = None,
    ) -> None:
        """Initialize the RAG manager.

        Args:
            vector_store: Chroma connection config (default: ephemeral).
            embedding: Embedding model config.
            client: Pre-created Chroma client (overrides vector_store).
        """
        self._vector_store = vector_store or VectorStoreConfig(provider="chroma")
        self._embedding_config = embedding or EmbeddingConfig(
            provider="fastembed", model="BAAI/bge-small-en-v1.5"
        )
        self._client: ClientAPI | None = client

        # Cached embedding function (lazy init)
        self._ef: ChromaEmbeddingFunction | None = None

    # --- Client lifecycle -------------------------------------------------

    @property
    def client(self) -> ClientAPI:
        """Lazy-initialized Chroma client."""
        if self._client is None:
            self._client = create_chroma_client(self._vector_store)
        return self._client

    @property
    def embedding_function(self) -> ChromaEmbeddingFunction:
        if self._ef is None:
            self._ef = ChromaEmbeddingFunction(self._embedding_config)
        return self._ef

    def reset(self) -> None:
        """Reset the Chroma database (destructive — all collections deleted).

        Source: https://docs.trychroma.com/reference/python/client#reset
        """
        self.client.reset()
        self._ef = None

    # --- Collection management --------------------------------------------

    def get_or_create_collection(
        self,
        collection_name: str,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> Any:
        """Get or create a Chroma collection with the configured embedding function.

        Source:
          https://docs.trychroma.com/reference/python/client#get_or_create_collection
        """
        return self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_function,
            metadata=metadata,
        )

    def create_collection(self, collection_name: str) -> Any:
        """Create a new Chroma collection.

        Source:
          https://docs.trychroma.com/reference/python/client#create_collection
        """
        return self.client.create_collection(
            name=collection_name,
            embedding_function=self.embedding_function,
        )

    def delete_collection(self, collection_name: str) -> None:
        """Delete a Chroma collection by name.

        Source:
          https://docs.trychroma.com/reference/python/client#delete_collection
        """
        self.client.delete_collection(collection_name)

    def list_collections(self) -> list[str]:
        """List all collection names.

        Source:
          https://docs.trychroma.com/reference/python/client#list_collections
        """
        return [c.name for c in self.client.list_collections()]

    # --- Retriever factory ------------------------------------------------

    def create_retriever(self, collection_name: str) -> ChromaRetriever:
        """Create a Chroma-backed retriever for the named collection."""
        collection = self.get_or_create_collection(collection_name)
        return ChromaRetriever(collection, embedding_function=self.embedding_function)

    # --- Document ingestion -----------------------------------------------

    def ingest(
        self,
        collection_name: str,
        ids: list[str],
        documents: list[str],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> None:
        """Add documents to a Chroma collection.

        Chroma auto-embeds via the configured embedding function.

        Source:
          https://docs.trychroma.com/reference/python/collection#add
        """
        collection = self.get_or_create_collection(collection_name)
        collection.add(ids=ids, documents=documents, metadatas=metadatas)

    def upsert(
        self,
        collection_name: str,
        ids: list[str],
        documents: list[str],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> None:
        """Upsert documents (add or update) in a Chroma collection.

        Source:
          https://docs.trychroma.com/reference/python/collection#upsert
        """
        collection = self.get_or_create_collection(collection_name)
        collection.upsert(ids=ids, documents=documents, metadatas=metadatas)

    def delete_documents(
        self,
        collection_name: str,
        ids: list[str] | None = None,
        where: dict[str, Any] | None = None,
    ) -> None:
        """Delete documents from a Chroma collection by ID or metadata filter.

        Source:
          https://docs.trychroma.com/reference/python/collection#delete
        """
        collection = self.get_or_create_collection(collection_name)
        collection.delete(ids=ids, where=where)

    # --- Knowledge source ingestion ----------------------------------------

    async def ingest_from_source(
        self,
        source: Any,  # KnowledgeSource
        *,
        collection_name: str | None = None,
    ) -> dict[str, Any]:
        """Extract documents from a knowledge source and ingest into Chroma.

        Args:
            source: A ``KnowledgeSource`` subclass (TextSource, FileSource,
                    URLSource, GitHubSource, etc.).
            collection_name: Chroma collection (defaults to source label).

        Returns:
            Corpus statistics dict for use with ``StrategySelector``.

        Source:
          - Chroma ``collection.add()``:
            https://docs.trychroma.com/docs/collections/add-data

        Usage::

            source = FileSource("docs/architecture.md")
            stats = await manager.ingest_from_source(source)
            pipeline = manager.auto_pipeline("How does the auth system work?", stats)
        """
        from telaios.core.knowledge_source import KnowledgeSource

        if not isinstance(source, KnowledgeSource):
            raise TypeError(f"Expected KnowledgeSource, got {type(source).__name__}")

        docs = await source.extract()
        if not docs:
            return source.corpus_stats([])

        col_name = collection_name or source.label.replace(" ", "-").lower() or "default"

        ids = [d.id for d in docs]
        texts = [d.content for d in docs]
        metas = [d.to_chroma()[2] for d in docs]

        # Chroma add() — auto-embeds via the configured embedding function
        # Source: https://docs.trychroma.com/docs/collections/add-data
        collection = self.get_or_create_collection(col_name)
        collection.add(ids=ids, documents=texts, metadatas=metas)

        stats = source.corpus_stats(docs)
        stats["collection_name"] = col_name
        return stats

    # --- Auto-strategy pipeline -------------------------------------------

    def auto_pipeline(
        self,
        query: str,
        *,
        corpus_stats: dict[str, Any] | None = None,
        llm: Any | None = None,
        collection_name: str | None = None,
        top_k: int | None = None,
    ) -> tuple[RagStrategyEnum, str, RagConfig]:
        """Select the best strategy and create a pipeline automatically.

        Analyzes the query (and optional corpus stats) to pick the optimal
        RAG strategy. Returns the pipeline, the strategy, and the reasoning.

        Args:
            query: The user's question.
            corpus_stats: Optional corpus profile from ``ingest_from_source()``.
            llm: LLM instance (defaults to ``FakeLLM``).
            collection_name: Chroma collection.
            top_k: Override default top-k (computed from corpus size).

        Returns:
            ``(strategy, reason, config)``. Use ``config`` with
            ``create_pipeline()``, or call ``auto_pipeline()`` followed
            by ``create_pipeline()`` directly.

        Usage::

            stats = await manager.ingest_from_source(URLSource("https://..."))
            pipeline = manager.create_pipeline(
                auto_config(llm=llm),
                llm=llm,
            )
            output = await pipeline.answer(input)

        Or use ``auto_pipeline()`` for the full flow.
        """
        from telaios.core.strategy_selector import StrategySelector

        if llm is None:
            from telaios.core.fake_llm import FakeLLM

            llm = FakeLLM()

        selector = StrategySelector()
        query_profile = selector.analyze_query(query)

        if corpus_stats:
            corpus_profile = selector.analyze_corpus(corpus_stats)
        else:
            from telaios.core.strategy_selector import CorpusProfile

            corpus_profile = CorpusProfile()

        strategy, reason = selector.select(corpus_profile, query_profile)

        # Compute sensible top_k from corpus size
        if top_k is None:
            doc_count = corpus_stats.get("document_count", 1) if corpus_stats else 1
            top_k = min(max(3, doc_count), 10)

        config = RagConfig(strategy=strategy, top_k=top_k)
        return strategy, reason, config

    # --- Pipeline factory -------------------------------------------------

    def create_pipeline(
        self,
        config: RagConfig,
        *,
        llm: LLM,
        collection_name: str | None = None,
    ) -> RAGStrategy:
        """Create a fully-wired RAG strategy pipeline.

        Args:
            config: Full RAG pipeline configuration.
            llm: LLM instance for the generation step.
            collection_name: Chroma collection to use (defaults to config's
                             collection name from ``vector_store``).

        Returns:
            A strategy instance ready for ``answer()`` or ``astream()``.

        Usage::

            pipeline = manager.create_pipeline(
                RagConfig(strategy=RagStrategy.CRAG, top_k=5),
                llm=my_llm,
            )
            output = await pipeline.answer(
                AgentInput(messages=[Message(role=MessageRole.HUMAN, content="...")])
            )
        """
        col_name = collection_name or (
            config.vector_store.extra.get("collection_name", "default")
            if config.vector_store
            else "default"
        )
        retriever = self.create_retriever(col_name)
        strategy = config.strategy

        if strategy == RagStrategyEnum.SIMPLE:
            return SimpleRAG(retriever, llm, config)

        if strategy == RagStrategyEnum.HYBRID:
            # Hybrid needs multiple retrievers (vector + BM25 by default)
            bm25_collection = f"{col_name}_bm25"
            bm25_retriever = self.create_retriever(bm25_collection)
            return HybridRAG(retriever, llm, config, retrievers=[retriever, bm25_retriever])

        if strategy == RagStrategyEnum.AGENTIC:
            return AgenticRAG(retriever, llm, config)

        if strategy == RagStrategyEnum.GRAPH:
            from telaios.core.types import GraphStoreConfig

            graph_config = config.graph_store or GraphStoreConfig()
            graph_store = _build_graph_store(graph_config)
            return GraphRAG(retriever, llm, config, graph_store=graph_store)

        if strategy == RagStrategyEnum.CRAG:
            return CRAG(retriever, llm, config)

        if strategy == RagStrategyEnum.SELF_RAG:
            return SelfRAG(retriever, llm, config)

        raise ValueError(f"Unknown RAG strategy: {strategy}")


def _build_graph_store(config: Any) -> Any:
    """Build a concrete graph store from config.

    Returns an in-memory NetworkX-backed store for dev/testing.
    Production deployments wire in Neo4j or FalkorDB.
    """
    from telaios.core.graph_store import InMemoryGraphStore

    return InMemoryGraphStore()
