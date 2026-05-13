"""Internal API Pydantic schemas (agent-service ↔ data-api)."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field

# ── Document status update ─────────────────────────────────────────────────────


class PatchDocumentStatusBody(BaseModel):
    status: str  # DocumentStatus literal enforced at service layer
    error_message: str | None = None


# ── Chunk storage ──────────────────────────────────────────────────────────────


class ChunkIn(BaseModel):
    chunk_index: int = Field(ge=0)
    content: str = Field(min_length=1)
    embedding: list[float]
    metadata: dict[str, Any] | None = None


class StoreChunksBody(BaseModel):
    chunks: list[ChunkIn]


class StoreChunksResponse(BaseModel):
    stored: int


# ── Similarity search ──────────────────────────────────────────────────────────


class SearchChunksBody(BaseModel):
    project_id: uuid.UUID
    embedding: list[float]
    limit: int = Field(default=5, ge=1, le=20)


# ── Plan lifecycle ─────────────────────────────────────────────────────────────


class UpdatePlanStatusExecuting(BaseModel):
    status: str = "executing"


class UpdatePlanStatusCompleted(BaseModel):
    status: str = "completed"


class UpdatePlanStatusFailed(BaseModel):
    status: str = "failed"
    failure_reason: str | None = None


UpdatePlanStatusBody = (
    UpdatePlanStatusExecuting | UpdatePlanStatusCompleted | UpdatePlanStatusFailed
)


class SkipDependentResponse(BaseModel):
    skipped: int


class CancelPlanTasksResponse(BaseModel):
    cancelled: int


# ── Artifacts ─────────────────────────────────────────────────────────────────


class ArtifactInBody(BaseModel):
    artifact_type: str
    content: str
    content_type: str = "text/plain"


class BulkArtifactsBody(BaseModel):
    artifacts: list[ArtifactInBody]


# ── User role promotion ────────────────────────────────────────────────────────


class UpdateUserRoleBody(BaseModel):
    system_role: str  # "admin" | "member" — validated at service layer


__all__ = [
    "ArtifactInBody",
    "BulkArtifactsBody",
    "CancelPlanTasksResponse",
    "ChunkIn",
    "PatchDocumentStatusBody",
    "SearchChunksBody",
    "SkipDependentResponse",
    "StoreChunksBody",
    "StoreChunksResponse",
    "UpdatePlanStatusBody",
    "UpdatePlanStatusCompleted",
    "UpdatePlanStatusExecuting",
    "UpdatePlanStatusFailed",
    "UpdateUserRoleBody",
]
