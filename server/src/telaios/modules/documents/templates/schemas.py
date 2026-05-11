"""Document template Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

DocumentFileType = Literal["pdf", "docx", "xlsx", "md", "txt", "csv", "json", "other"]


class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    file_type: DocumentFileType
    category: str | None = None
    is_global: bool = True
    project_id: uuid.UUID | None = None


class TemplatePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    file_type: DocumentFileType
    s3_key: str | None
    category: str | None
    is_global: bool
    project_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


__all__ = ["TemplateCreate", "TemplatePatch", "TemplateRead"]
