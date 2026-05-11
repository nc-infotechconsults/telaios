"""Document tag Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    color: str = "#3B82F6"


class TagPatch(BaseModel):
    name: str | None = None
    color: str | None = None


class TagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    color: str
    created_at: datetime


__all__ = ["TagCreate", "TagPatch", "TagRead"]
