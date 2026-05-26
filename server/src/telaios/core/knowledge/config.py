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
    # Optional code-specific embedder for the repositories collection.
    # When set, repositories use this model; documents use `embedding`.
    # Recommended: jinaai/jina-embeddings-v2-base-code (768 dims)
    # Note: changing this requires re-creating the repositories Qdrant collection.
    code_embedding: EmbeddingConfig | None = None

    # Collection names (global, filtered by project_id)
    documents_collection: str = "documents"
    repositories_collection: str = "repositories"

    # Retrieval
    top_k: int = 10
    rrf_k: int = 60
    hyde_enabled: bool = True

    # Reranker — cross-encoder applied after RRF fusion
    reranker_enabled: bool = False
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    # Over-fetch this many candidates before reranking; must be >= top_k
    rerank_candidates: int = 50

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

    # Stage 1 migration flag: when True, ingestion skips Qdrant+BM25 for the
    # repositories collection and uses FalkorDB + direct file reads instead.
    code_graph_only: bool = False

    # File reader type for read_source tool: "local" or "s3"
    file_reader_type: str = "local"
    # S3 settings (used when file_reader_type == "s3")
    s3_bucket: str = ""
    s3_key_prefix: str = ""


__all__ = ["EmbeddingConfig", "GraphStoreConfig", "KnowledgePipelineConfig", "QdrantConfig"]
