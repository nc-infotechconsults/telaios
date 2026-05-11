"""Project service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.projects.repository import ProjectRepository
from telaios.modules.projects.schemas import (
    ProjectCreate,
    ProjectListResponse,
    ProjectPatch,
    ProjectQuery,
    ProjectRead,
)
from telaios.utils.errors import NotFoundError


class ProjectService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = ProjectRepository(session)
        self._session = session

    async def list_projects(self, query: ProjectQuery) -> ProjectListResponse:
        items, total = await self._repo.list(q=query.q, page=query.page, limit=query.limit)
        return ProjectListResponse(
            items=[ProjectRead.model_validate(p) for p in items],
            total=total,
            page=query.page,
            limit=query.limit,
        )

    async def create_project(
        self, dto: ProjectCreate, creator_id: uuid.UUID | None = None
    ) -> ProjectRead:
        data: dict[str, object] = {"name": dto.name}
        if dto.description is not None:
            data["description"] = dto.description
        if dto.status is not None:
            data["status"] = dto.status

        project = await self._repo.create(**data)

        # Auto-add creator as owner
        if creator_id is not None:
            from telaios.modules.projects.members.service import MemberService

            await MemberService(self._session).add_member(project.id, creator_id, role="owner")

        return ProjectRead.model_validate(project)

    async def get_project(self, project_id: uuid.UUID) -> ProjectRead:
        project = await self._repo.find_by_id(project_id)
        if project is None:
            raise NotFoundError("Project not found")
        return ProjectRead.model_validate(project)

    async def patch_project(self, project_id: uuid.UUID, dto: ProjectPatch) -> ProjectRead:
        project = await self._repo.find_by_id(project_id)
        if project is None:
            raise NotFoundError("Project not found")
        updates: dict[str, object] = {}
        if dto.name is not None:
            updates["name"] = dto.name
        if dto.description is not None:
            updates["description"] = dto.description
        if dto.status is not None:
            updates["status"] = dto.status
        project = await self._repo.update(project, **updates)
        return ProjectRead.model_validate(project)

    async def delete_project(self, project_id: uuid.UUID) -> None:
        project = await self._repo.find_by_id(project_id)
        if project is None:
            raise NotFoundError("Project not found")
        await self._repo.soft_delete(project)
