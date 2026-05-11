"""Project repository — CRUD for the ``projects`` table."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.projects import Project


class ProjectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list(
        self,
        *,
        q: str | None,
        page: int,
        limit: int,
    ) -> tuple[list[Project], int]:
        stmt = select(Project).where(Project.deleted_at.is_(None))
        if q:
            like = f"%{q}%"
            stmt = stmt.where(or_(Project.name.ilike(like), Project.description.ilike(like)))
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self._s.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(Project.created_at.desc()).offset((page - 1) * limit).limit(limit)
        rows = list((await self._s.execute(stmt)).scalars().all())
        return rows, total

    async def find_by_id(self, project_id: uuid.UUID) -> Project | None:
        result = await self._s.execute(
            select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> Project:
        project = Project(**kwargs)
        self._s.add(project)
        await self._s.flush()
        await self._s.refresh(project)
        return project

    async def update(self, project: Project, **kwargs: object) -> Project:
        for k, v in kwargs.items():
            setattr(project, k, v)
        await self._s.flush()
        await self._s.refresh(project)
        return project

    async def soft_delete(self, project: Project) -> None:
        project.deleted_at = datetime.now(UTC)
        await self._s.flush()
