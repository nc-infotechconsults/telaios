"""Document comments business-logic service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.documents.comments.repository import CommentRepository
from telaios.modules.documents.comments.schemas import CommentCreate, CommentPatch, CommentRead
from telaios.utils.errors import NotFoundError


class CommentService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = CommentRepository(session)

    async def list_by_document(self, document_id: uuid.UUID) -> list[CommentRead]:
        comments = await self._repo.list_by_document(document_id)
        return [CommentRead.model_validate(c) for c in comments]

    async def get(self, comment_id: uuid.UUID) -> CommentRead:
        comment = await self._repo.find(comment_id)
        if comment is None:
            raise NotFoundError("Comment not found")
        return CommentRead.model_validate(comment)

    async def create(
        self,
        document_id: uuid.UUID,
        dto: CommentCreate,
        user_id: uuid.UUID | None = None,
    ) -> CommentRead:
        comment = await self._repo.create(
            document_id,
            user_id=user_id,
            content=dto.content,
            anchor_type=dto.anchor_type,
            anchor_data=dto.anchor_data,
            parent_comment_id=dto.parent_comment_id,
        )
        return CommentRead.model_validate(comment)

    async def patch(self, comment_id: uuid.UUID, dto: CommentPatch) -> CommentRead:
        comment = await self._repo.find(comment_id)
        if comment is None:
            raise NotFoundError("Comment not found")
        for key, value in dto.model_dump(exclude_unset=True).items():
            setattr(comment, key, value)
        comment = await self._repo.save(comment)
        return CommentRead.model_validate(comment)

    async def delete(self, comment_id: uuid.UUID) -> None:
        comment = await self._repo.find(comment_id)
        if comment is None:
            raise NotFoundError("Comment not found")
        await self._repo.delete_comment(comment)


__all__ = ["CommentService"]
