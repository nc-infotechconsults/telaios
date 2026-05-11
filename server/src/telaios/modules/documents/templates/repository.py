"""Document templates DB repository."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.documents import DocumentTemplate


class TemplateRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_global(self) -> list[DocumentTemplate]:
        result = await self._s.execute(
            select(DocumentTemplate)
            .where(DocumentTemplate.is_global.is_(True))
            .order_by(DocumentTemplate.name)
        )
        return list(result.scalars().all())

    async def list_by_project(self, project_id: uuid.UUID) -> list[DocumentTemplate]:
        """Return project-specific + global templates visible to this project."""
        result = await self._s.execute(
            select(DocumentTemplate)
            .where(
                or_(
                    DocumentTemplate.project_id == project_id,
                    DocumentTemplate.is_global.is_(True),
                )
            )
            .order_by(DocumentTemplate.name)
        )
        return list(result.scalars().all())

    async def find(self, template_id: uuid.UUID) -> DocumentTemplate | None:
        result = await self._s.execute(
            select(DocumentTemplate).where(DocumentTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: Any) -> DocumentTemplate:
        obj = DocumentTemplate(**kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(
            select(DocumentTemplate).where(DocumentTemplate.id == obj.id)
        )
        return result.scalar_one()

    async def save(self, obj: DocumentTemplate) -> DocumentTemplate:
        await self._s.flush()
        result = await self._s.execute(
            select(DocumentTemplate).where(DocumentTemplate.id == obj.id)
        )
        return result.scalar_one()

    async def delete_template(self, obj: DocumentTemplate) -> None:
        await self._s.delete(obj)
        await self._s.flush()


__all__ = ["TemplateRepository"]
