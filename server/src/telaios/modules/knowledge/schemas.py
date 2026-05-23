"""Pydantic schemas for the knowledge base API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from telaios.domain.enums import RelevanceTier


class KnowledgeQueryRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    source: Literal["all", "documents", "repositories"] = "all"
    top_k: int = Field(default=5, ge=1, le=50)


class KnowledgeChunkRead(BaseModel):
    content: str
    source_collection: str
    metadata: dict[str, Any]
    relevance: RelevanceTier = Field(
        ...,
        description=(
            "Relevance tier derived from normalized RRF score. "
            "high ≥ 0.70 · medium ≥ 0.35 · low < 0.35"
        ),
    )


class CitationRead(BaseModel):
    index: int
    source_path: str
    symbol_name: str | None = None
    start_line: int | None = None
    collection: str


class KnowledgeQueryResponse(BaseModel):
    query: str
    answer: str | None = Field(
        default=None,
        description="LLM-synthesized answer with inline [N] citations. "
                    "None when no chunks were retrieved or generation is disabled.",
    )
    citations: list[CitationRead] = Field(
        default_factory=list,
        description="Sources cited in the answer, in citation order.",
    )
    chunks: list[KnowledgeChunkRead]
    sources_searched: list[str]
    total: int


class IngestDocumentsRequest(BaseModel):
    source_type: Literal["text", "file", "url", "github", "docling"] = "text"
    content: str | None = None
    url: str | None = None
    repo_url: str | None = None
    branch: str = "main"
    subpath: str = "/"
    token: str | None = None


class IngestRepositoryRequest(BaseModel):
    source_type: Literal["file", "github", "git"] = "github"
    repo_url: str | None = None
    branch: str = "main"
    subpath: str = ""
    token: str | None = None
    ssh_key: str | None = None
    local_path: str | None = None
    language: str = "python"


class IngestResponse(BaseModel):
    collection: str
    project_id: str
    document_count: int
    chunk_count: int
    triplet_count: int = 0
