"""KnowledgePipelineConfig — single configuration model for the entire pipeline."""

from __future__ import annotations

from pydantic import BaseModel

from telaios.domain.enums import GraphStoreProvider


class GraphStoreConfig(BaseModel):
    """Connection settings for a persistent graph store."""

    provider: GraphStoreProvider = GraphStoreProvider.NETWORKX
    uri: str | None = None
    username: str = ""
    password: str = ""
    database: str = "knowledge"
    extra: dict = {}


class QdrantConfig(BaseModel):
    """Connection settings for Qdrant."""

    host: str = "localhost"
    port: int = 6333
    grpc_port: int = 6334
    prefer_grpc: bool = False
    api_key: str | None = None
    url: str | None = None  # e.g. "https://xyz.qdrant.io" for cloud


class EmbeddingConfig(BaseModel):
    """Embedding model configuration.

    provider: ``fastembed`` (default, in-process) | ``tei`` (TEI HTTP server)
    base_url: required for ``tei`` — e.g. ``http://localhost:8080``
    """

    provider: str = "fastembed"
    # fastembed default: intfloat/multilingual-e5-large (1024 dims, 100+ languages)
    # tei default:       BAAI/bge-m3 (1024 dims, superior quality, needs TEI server)
    model: str = "intfloat/multilingual-e5-large"
    api_key: str = ""
    dimensions: int | None = None
    base_url: str | None = None


class KnowledgePipelineConfig(BaseModel):
    """Full configuration for the KnowledgeBasePipeline."""

    # Qdrant
    qdrant: QdrantConfig = QdrantConfig()
    embedding: EmbeddingConfig = EmbeddingConfig()

    # Collection names (global, filtered by project_id)
    documents_collection: str = "documents"
    repositories_collection: str = "repositories"

    # Retrieval
    top_k: int = 10
    rrf_k: int = 60
    hyde_enabled: bool = True

    # Graph
    graph_store: GraphStoreConfig = GraphStoreConfig()
    graph_augmentation_enabled: bool = True
    graph_augmentation_depth: int = 1

    # Ingestion — documents
    document_chunk_size: int = 512
    document_chunk_overlap: int = 64

    # Ingestion — code (AST chunker)
    code_chunk_max_lines: int = 150

    # Generation (RAG answer synthesis)
    generation_enabled: bool = True
    generation_max_context_chars: int = 12000  # total chars of chunk content fed to LLM

    # Documentation generation (LLM-driven repo doc synthesis)
    docgen_enabled: bool = True


__all__ = ["EmbeddingConfig", "GraphStoreConfig", "KnowledgePipelineConfig", "QdrantConfig"]
