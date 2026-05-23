"""Pydantic schemas for the knowledge base API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class KnowledgeQueryRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    source: Literal["all", "documents", "repositories"] = "all"
    top_k: int = Field(default=5, ge=1, le=50)


class KnowledgeChunkRead(BaseModel):
    content: str
    source_collection: str
    metadata: dict[str, Any]
    score: float


class KnowledgeQueryResponse(BaseModel):
    query: str
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
    source_type: Literal["file", "github"] = "github"
    repo_url: str | None = None
    branch: str = "main"
    subpath: str = "/"
    token: str | None = None
    local_path: str | None = None
    language: str = "python"


class IngestResponse(BaseModel):
    collection: str
    project_id: str
    document_count: int
    chunk_count: int
    triplet_count: int = 0
