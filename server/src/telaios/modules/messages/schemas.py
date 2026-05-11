"""Message Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

MessageRole = Literal["user", "assistant", "system"]


class MessageCreate(BaseModel):
    role: MessageRole
    content: str
    plan_id: uuid.UUID | None = None


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    plan_id: uuid.UUID | None
    role: MessageRole
    content: str
    created_at: datetime


__all__ = ["MessageCreate", "MessageRead", "MessageRole"]
