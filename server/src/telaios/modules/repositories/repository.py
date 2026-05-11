"""Repository DB repository (CRUD)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.repositories import Repository


class RepositoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_project(self, project_id: uuid.UUID) -> list[Repository]:
        result = await self._s.execute(
            select(Repository)
            .where(
                Repository.project_id == project_id,
                Repository.deleted_at.is_(None),
            )
            .order_by(Repository.name.asc())
        )
        return list(result.scalars().all())

    async def find(self, repo_id: uuid.UUID, project_id: uuid.UUID) -> Repository | None:
        result = await self._s.execute(
            select(Repository).where(
                Repository.id == repo_id,
                Repository.project_id == project_id,
                Repository.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> Repository:
        obj = Repository(**kwargs)
        self._s.add(obj)
        await self._s.flush()
        await self._s.refresh(obj)
        return obj

    async def save(self, obj: Repository) -> Repository:
        await self._s.flush()
        await self._s.refresh(obj)
        return obj

    async def soft_delete(self, obj: Repository) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()
