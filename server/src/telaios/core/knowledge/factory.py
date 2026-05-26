"""KnowledgePipelineFactory — builds and caches a KnowledgeBasePipeline singleton.

Priority chain:
  1. Explicitly passed ``KnowledgePipelineConfig`` (agent/runtime override)
  2. Environment variables / ``.env`` file (via ``telaios.config.settings``)
  3. Hard-coded defaults inside ``KnowledgePipelineConfig``

When a caller passes ``config`` to ``get()``, a fresh non-singleton pipeline is
returned so the singleton (built from settings) is never mutated by per-request
overrides.  Call ``reset()`` to force the singleton to rebuild on the next call
(e.g. after runtime settings changes).
"""

from __future__ import annotations

import asyncio
import logging

from telaios.core.knowledge.config import (
    EmbeddingConfig,
    GraphStoreConfig,
    KnowledgePipelineConfig,
    QdrantConfig,
)
from telaios.core.knowledge.pipeline import KnowledgeBasePipeline

logger = logging.getLogger(__name__)

_lock: asyncio.Lock | None = None
_instance: KnowledgeBasePipeline | None = None


def _get_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


class KnowledgePipelineFactory:
    """Lazy singleton factory for KnowledgeBasePipeline.

    Usage::

        # Default: singleton built from .env settings
        pipeline = await KnowledgePipelineFactory.get()

        # Agent runtime override: fresh instance, does NOT replace singleton
        pipeline = await KnowledgePipelineFactory.get(config=custom_config)

        # Force singleton rebuild (e.g. after DB settings change)
        KnowledgePipelineFactory.reset()
        pipeline = await KnowledgePipelineFactory.get()
    """

    @staticmethod
    async def get(
        config: KnowledgePipelineConfig | None = None,
        llm: object | None = None,
    ) -> KnowledgeBasePipeline:
        """Return the pipeline.

        If ``config`` is provided the singleton is bypassed and a fresh
        pipeline is built — allowing per-request/agent overrides without
        touching the global singleton.

        ``llm`` overrides the LangChain model used by HyDE and GraphAugmentor.
        Useful for injecting a FakeLLM in tests without requiring the langchain
        package to be installed.
        """
        global _instance

        if config is not None:
            return await KnowledgePipelineFactory._build(config, llm=llm)

        if _instance is not None:
            return _instance

        async with _get_lock():
            if _instance is not None:
                return _instance
            cfg = KnowledgePipelineFactory.from_settings()
            _instance = await KnowledgePipelineFactory._build(cfg, llm=llm)
            logger.info("KnowledgeBasePipeline singleton initialised")
            return _instance

    @staticmethod
    def reset() -> None:
        """Clear the singleton so the next ``get()`` call rebuilds from settings.

        Call this after runtime configuration changes (e.g. DB LLM settings update)
        or between integration tests to guarantee isolation.
        """
        global _instance
        _instance = None
        logger.info("KnowledgeBasePipeline singleton cleared")

    @staticmethod
    async def delete_project_data(project_id: str) -> None:
        """Delete all data for *project_id* without requiring a full pipeline initialisation.

        If the singleton is already built it is reused.  Otherwise a minimal set of
        store clients (Qdrant + BM25 + graph store) is created from settings — no
        embedder or LLM is loaded — so this is safe to call before any ingestion.
        """
        global _instance
        if _instance is not None:
            await _instance.delete_project_data(project_id)
            return

        cfg = KnowledgePipelineFactory.from_settings()
        await KnowledgePipelineFactory._delete_minimal(project_id, cfg)

    @staticmethod
    async def _delete_minimal(project_id: str, config: KnowledgePipelineConfig) -> None:
        """Build only the store clients needed for deletion and run the cleanup."""
        from qdrant_client import AsyncQdrantClient

        from telaios.core.stores.bm25 import BM25Store
        from telaios.core.stores.graph import GraphStoreFactory
        from telaios.core.stores.qdrant import QdrantVectorStore

        if config.qdrant.url:
            qdrant_client = AsyncQdrantClient(
                url=config.qdrant.url,
                api_key=config.qdrant.api_key,
            )
        else:
            qdrant_client = AsyncQdrantClient(
                host=config.qdrant.host,
                port=config.qdrant.port,
            )

        vs = QdrantVectorStore(client=qdrant_client, embedder=None)  # type: ignore[arg-type]
        bm25 = BM25Store()

        for collection in [config.documents_collection, config.repositories_collection]:
            await vs.delete_by_project(collection=collection, project_id=project_id)
            bm25.delete_project(collection=collection, project_id=project_id)

        try:
            graph_store = GraphStoreFactory.create(config.graph_store)
            await graph_store.adelete_project(project_id)
        except Exception:
            logger.warning(
                "Graph store delete for project %r failed (store may be offline)",
                project_id,
                exc_info=True,
            )
        logger.info("Deleted project %r data (minimal path)", project_id)

    @staticmethod
    def from_settings() -> KnowledgePipelineConfig:
        """Build a ``KnowledgePipelineConfig`` from the current application settings.

        .env → Settings → KnowledgePipelineConfig.  Every field in the config has
        a matching ``settings.*`` value so the whole pipeline is configurable via
        environment variables with no code changes.
        """
        from telaios.config.settings import settings
        from telaios.domain.enums import GraphStoreProvider

        qdrant = QdrantConfig(
            url=settings.QDRANT_URL,
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            api_key=settings.QDRANT_API_KEY,
        )

        embedding = EmbeddingConfig(
            provider=settings.EMBEDDING_PROVIDER or "fastembed",
            model=settings.EMBEDDING_MODEL,
            api_key=settings.EMBEDDING_API_KEY or "",
            base_url=settings.EMBEDDING_BASE_URL,
            dimensions=settings.EMBEDDING_DIM if settings.EMBEDDING_DIM != 1024 else None,
        )

        # Graph store: resolve provider enum from string
        provider_str = settings.GRAPH_STORE_PROVIDER.lower()
        try:
            provider = GraphStoreProvider(provider_str)
        except ValueError:
            logger.warning(
                "Unknown GRAPH_STORE_PROVIDER=%r, falling back to networkx", provider_str
            )
            provider = GraphStoreProvider.NETWORKX

        graph_store = GraphStoreConfig(
            provider=provider,
            uri=settings.NEO4J_URI if provider == GraphStoreProvider.NEO4J else settings.FALKORDB_URI,
            username=(
                settings.NEO4J_USERNAME
                if provider == GraphStoreProvider.NEO4J
                else settings.FALKORDB_USERNAME
            ),
            password=(
                settings.NEO4J_PASSWORD
                if provider == GraphStoreProvider.NEO4J
                else settings.FALKORDB_PASSWORD
            ),
            database=settings.NEO4J_DATABASE,
        )

        return KnowledgePipelineConfig(
            qdrant=qdrant,
            embedding=embedding,
            graph_store=graph_store,
        )

    @staticmethod
    async def _build(
        config: KnowledgePipelineConfig,
        llm: object | None = None,
    ) -> KnowledgeBasePipeline:
        from qdrant_client import AsyncQdrantClient

        from telaios.config.settings import settings
        from telaios.core.embedders import EmbedderFactory
        from telaios.core.knowledge.graph import GraphAugmentor
        from telaios.core.knowledge.hyde import HyDE
        from telaios.core.knowledge.ingestion import IngestionService
        from telaios.core.stores.bm25 import BM25Store
        from telaios.core.stores.graph import GraphStoreFactory
        from telaios.core.stores.qdrant import QdrantVectorStore

        # Qdrant client
        if config.qdrant.url:
            qdrant_client = AsyncQdrantClient(
                url=config.qdrant.url,
                api_key=config.qdrant.api_key,
            )
        else:
            qdrant_client = AsyncQdrantClient(
                host=config.qdrant.host,
                port=config.qdrant.port,
            )

        # Embedder — provider-agnostic (fastembed | tei)
        embedder = EmbedderFactory.create(config.embedding)

        # Optional code-specific embedder for the repositories collection
        collection_embedder_map = {}
        if config.code_embedding is not None:
            code_embedder = EmbedderFactory.create(config.code_embedding)
            collection_embedder_map[config.repositories_collection] = code_embedder

        vector_store = QdrantVectorStore(
            client=qdrant_client,
            embedder=embedder,
            collection_embedder_map=collection_embedder_map or None,
        )

        bm25_store = BM25Store()

        # LLM — caller can inject (e.g. FakeLLM for tests); otherwise read from settings
        if llm is None:
            from langchain.chat_models import init_chat_model

            llm_kwargs: dict = {
                "model_provider": settings.LLM_PROVIDER,
                "model": settings.LLM_MODEL,
            }
            if settings.LLM_API_KEY:
                llm_kwargs["api_key"] = settings.LLM_API_KEY
            if settings.LLM_BASE_URL:
                llm_kwargs["base_url"] = settings.LLM_BASE_URL
            llm = init_chat_model(**llm_kwargs)

        graph_store = GraphStoreFactory.create(config.graph_store)

        graph_augmentor = GraphAugmentor(
            graph_store=graph_store,
            llm=llm,
            depth=config.graph_augmentation_depth,
        )

        hyde = HyDE(llm=llm, vector_store=vector_store)

        ingestion = IngestionService(
            vector_store=vector_store,
            bm25_store=bm25_store,
            graph_augmentor=graph_augmentor if config.graph_augmentation_enabled else None,
            config=config,
        )

        docgen = None
        if config.docgen_enabled:
            from telaios.core.knowledge.docgen import RepoDocGenerator
            docgen = RepoDocGenerator(llm=llm, config=config)

        reranker = None
        if config.reranker_enabled:
            from telaios.core.knowledge.reranker import CrossEncoderReranker
            reranker = CrossEncoderReranker(model=config.reranker_model)

        # FileReader — local disk or S3 depending on config
        from telaios.core.knowledge.file_reader import FileReaderFactory
        if config.file_reader_type == "s3" and config.s3_bucket:
            import boto3
            s3_client = boto3.client("s3")
            file_reader = FileReaderFactory.s3(
                s3_client=s3_client,
                bucket=config.s3_bucket,
                key_prefix=config.s3_key_prefix,
            )
        else:
            file_reader = FileReaderFactory.local()

        return KnowledgeBasePipeline(
            vector_store=vector_store,
            bm25_store=bm25_store,
            graph_augmentor=graph_augmentor,
            hyde=hyde,
            llm=llm,
            ingestion=ingestion,
            config=config,
            docgen=docgen,
            reranker=reranker,
            file_reader=file_reader,
        )


__all__ = ["KnowledgePipelineFactory"]
