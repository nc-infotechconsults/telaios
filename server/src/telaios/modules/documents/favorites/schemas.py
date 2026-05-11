"""Document favorite Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FavoriteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime


__all__ = ["FavoriteRead"]
