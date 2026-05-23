"""Document comment Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from telaios.domain.enums import DocumentCommentAnchorType


class CommentCreate(BaseModel):
    content: str
    anchor_type: DocumentCommentAnchorType = DocumentCommentAnchorType.GENERAL
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
