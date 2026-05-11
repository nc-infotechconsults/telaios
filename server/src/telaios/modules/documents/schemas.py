"""Document Pydantic schemas (request / response)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

DocumentFileType = Literal["pdf", "docx", "xlsx", "md", "txt", "csv", "json", "other"]
DocumentStatus = Literal["uploading", "processing", "ready", "error"]


# ── Request DTOs ──────────────────────────────────────────────────────────────


class DocumentPatch(BaseModel):
    name: str | None = None
    folder_id: uuid.UUID | None = None
    status: DocumentStatus | None = None
    error_message: str | None = None
    current_version_id: uuid.UUID | None = None


# ── Response ──────────────────────────────────────────────────────────────────


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    folder_id: uuid.UUID | None
    current_version_id: uuid.UUID | None
    name: str
    file_type: DocumentFileType
    mime_type: str
    s3_key: str
    size_bytes: int
    checksum_sha256: str
    status: DocumentStatus
    error_message: str | None
    doc_metadata: dict[str, Any] | None
    uploaded_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class PresignedDownloadResponse(BaseModel):
    url: str
    expires_in: int


__all__ = [
    "DocumentFileType",
    "DocumentPatch",
    "DocumentRead",
    "DocumentStatus",
    "PresignedDownloadResponse",
]
