"""Document comment Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

DocumentCommentAnchorType = Literal["page", "cell", "text_range", "general"]


class CommentCreate(BaseModel):
    content: str
    anchor_type: DocumentCommentAnchorType = "general"
    anchor_data: dict[str, Any] | None = None
    parent_comment_id: uuid.UUID | None = None


class CommentPatch(BaseModel):
    content: str | None = None
    resolved: bool | None = None


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID | None
    content: str
    anchor_type: DocumentCommentAnchorType
    anchor_data: dict[str, Any] | None
    resolved: bool
    parent_comment_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


__all__ = ["CommentCreate", "CommentPatch", "CommentRead", "DocumentCommentAnchorType"]
