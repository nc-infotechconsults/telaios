"""Document folder Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FolderCreate(BaseModel):
    name: str
    parent_folder_id: uuid.UUID | None = None


class FolderPatch(BaseModel):
    name: str | None = None
    parent_folder_id: uuid.UUID | None = None


class FolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    parent_folder_id: uuid.UUID | None
    name: str
    path: str
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


__all__ = ["FolderCreate", "FolderPatch", "FolderRead"]
