"""Project skills Pydantic schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProjectSkillCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    content: str


class ProjectSkillPatch(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    content: str | None = None


class ProjectSkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    cloned_from_library_skill_id: uuid.UUID | None
    name: str
    slug: str
    description: str | None
    content: str
    created_at: datetime
    updated_at: datetime


class CloneSkillFromLibraryBody(BaseModel):
    library_skill_id: uuid.UUID
