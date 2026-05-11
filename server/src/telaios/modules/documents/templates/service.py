"""Document templates business-logic service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.documents.templates.repository import TemplateRepository
from telaios.modules.documents.templates.schemas import TemplateCreate, TemplatePatch, TemplateRead
from telaios.utils.errors import NotFoundError


class TemplateService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = TemplateRepository(session)

    async def list_global(self) -> list[TemplateRead]:
        templates = await self._repo.list_global()
        return [TemplateRead.model_validate(t) for t in templates]

    async def list_by_project(self, project_id: uuid.UUID) -> list[TemplateRead]:
        templates = await self._repo.list_by_project(project_id)
        return [TemplateRead.model_validate(t) for t in templates]

    async def get(self, template_id: uuid.UUID) -> TemplateRead:
        template = await self._repo.find(template_id)
        if template is None:
            raise NotFoundError("Template not found")
        return TemplateRead.model_validate(template)

    async def create(
        self, dto: TemplateCreate, created_by: uuid.UUID | None = None
    ) -> TemplateRead:
        template = await self._repo.create(
            name=dto.name,
            description=dto.description,
            file_type=dto.file_type,
            category=dto.category,
            is_global=dto.is_global,
            project_id=dto.project_id,
            created_by=created_by,
        )
        return TemplateRead.model_validate(template)

    async def patch(self, template_id: uuid.UUID, dto: TemplatePatch) -> TemplateRead:
        template = await self._repo.find(template_id)
        if template is None:
            raise NotFoundError("Template not found")
        for key, value in dto.model_dump(exclude_unset=True).items():
            setattr(template, key, value)
        template = await self._repo.save(template)
        return TemplateRead.model_validate(template)

    async def delete(self, template_id: uuid.UUID) -> None:
        template = await self._repo.find(template_id)
        if template is None:
            raise NotFoundError("Template not found")
        await self._repo.delete_template(template)


__all__ = ["TemplateService"]
