"""Task artifact Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

ArtifactType = Literal["diff", "test_result", "review", "log", "file", "link"]


class ArtifactCreate(BaseModel):
    type: ArtifactType
    title: str
    content: str
    content_type: str = "text/plain"
    artifact_metadata: dict[str, Any] | None = None
    sort_order: int = 0


class BulkArtifactCreate(BaseModel):
    artifacts: list[ArtifactCreate]


class ArtifactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    type: ArtifactType
    title: str
    content: str
    content_type: str
    artifact_metadata: dict[str, Any] | None
    sort_order: int
    created_at: datetime


__all__ = ["ArtifactCreate", "ArtifactRead", "ArtifactType", "BulkArtifactCreate"]
