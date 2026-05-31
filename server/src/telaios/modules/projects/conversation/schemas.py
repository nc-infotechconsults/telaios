"""Schemas for the project conversation module."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ConversationMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID | None
    sender_type: str
    specialist: str | None
    content: str
    created_at: datetime


class ConversationMessageRequest(BaseModel):
    content: str
    specialist: str | None = None  # None = auto-detect


class ConversationHistoryResponse(BaseModel):
    messages: list[ConversationMessageRead]
    total: int
