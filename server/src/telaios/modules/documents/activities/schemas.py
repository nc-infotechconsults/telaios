"""Document activity Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from telaios.domain.enums import DocumentActivityAction


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID | None
    action: DocumentActivityAction
    activity_metadata: dict[str, Any] | None
    created_at: datetime


__all__ = ["ActivityRead", "DocumentActivityAction"]
