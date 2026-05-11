"""Document version Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class VersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    version_number: int
    s3_key: str
    size_bytes: int
    checksum_sha256: str
    change_description: str | None
    created_by: uuid.UUID | None
    created_at: datetime


__all__ = ["VersionRead"]
