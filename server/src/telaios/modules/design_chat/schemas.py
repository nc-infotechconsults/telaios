"""Schemas for conversational UI design sessions."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

DesignSessionStatus = Literal["active", "archived"]
DesignMessageRole = Literal["user", "assistant", "system"]


class DesignSessionCreate(BaseModel):
    title: str | None = None


class DesignSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str | None
    status: DesignSessionStatus
    created_at: datetime
    updated_at: datetime


class DesignMessageRequest(BaseModel):
    content: str = Field(min_length=1)


class DesignMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    role: DesignMessageRole
    content: str
    created_at: datetime


class DesignArtifactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    revision: int
    title: str
    description: str | None
    html_content: str
    css_content: str | None
    js_content: str | None
    prompt: str | None
    rationale: str | None
    artifact_metadata: dict[str, Any] | None
    created_at: datetime


__all__ = [
    "DesignArtifactRead",
    "DesignMessageRead",
    "DesignMessageRequest",
    "DesignMessageRole",
    "DesignSessionCreate",
    "DesignSessionRead",
    "DesignSessionStatus",
]
