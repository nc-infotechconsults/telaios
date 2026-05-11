"""Document tags business-logic service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.documents.tags.repository import TagRepository
from telaios.modules.documents.tags.schemas import TagCreate, TagPatch, TagRead
from telaios.utils.errors import NotFoundError


class TagService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = TagRepository(session)

    async def list_by_project(self, project_id: uuid.UUID) -> list[TagRead]:
        tags = await self._repo.list_by_project(project_id)
        return [TagRead.model_validate(t) for t in tags]

    async def get(self, tag_id: uuid.UUID) -> TagRead:
        tag = await self._repo.find(tag_id)
        if tag is None:
            raise NotFoundError("Tag not found")
        return TagRead.model_validate(tag)

    async def create(self, project_id: uuid.UUID, dto: TagCreate) -> TagRead:
        tag = await self._repo.create(project_id, name=dto.name, color=dto.color)
        return TagRead.model_validate(tag)

    async def patch(self, tag_id: uuid.UUID, dto: TagPatch) -> TagRead:
        tag = await self._repo.find(tag_id)
        if tag is None:
            raise NotFoundError("Tag not found")
        for key, value in dto.model_dump(exclude_unset=True).items():
            setattr(tag, key, value)
        tag = await self._repo.save(tag)
        return TagRead.model_validate(tag)

    async def delete(self, tag_id: uuid.UUID) -> None:
        tag = await self._repo.find(tag_id)
        if tag is None:
            raise NotFoundError("Tag not found")
        await self._repo.delete_tag(tag)

    async def add_to_document(self, document_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        tag = await self._repo.find(tag_id)
        if tag is None:
            raise NotFoundError("Tag not found")
        await self._repo.add_to_document(document_id, tag_id)

    async def remove_from_document(self, document_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        await self._repo.remove_from_document(document_id, tag_id)


__all__ = ["TagService"]
