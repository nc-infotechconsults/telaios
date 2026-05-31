"""Message Pydantic schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from telaios.domain.enums import PlanMessageRole


class MessageCreate(BaseModel):
    role: PlanMessageRole
    content: str
    plan_id: uuid.UUID | None = None
    sender_type: str = "user"
    specialist: str | None = None
    user_id: uuid.UUID | None = None


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    plan_id: uuid.UUID | None
    user_id: uuid.UUID | None
    role: PlanMessageRole
    sender_type: str
    specialist: str | None
    content: str
    created_at: datetime


__all__ = ["MessageCreate", "MessageRead", "PlanMessageRole"]
