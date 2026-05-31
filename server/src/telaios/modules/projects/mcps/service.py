"""Project MCPs service."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.library import LibraryMCP
from telaios.db.models.project_resources import ProjectMCP
from telaios.modules.projects.mcps.schemas import (
    ProjectMcpCreate,
    ProjectMcpPatch,
    ProjectMcpRead,
)
from telaios.utils.errors import NotFoundError


class ProjectMcpService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_mcps(self, project_id: uuid.UUID) -> list[ProjectMcpRead]:
        stmt = (
            select(ProjectMCP)
            .where(ProjectMCP.project_id == project_id, ProjectMCP.deleted_at.is_(None))
            .order_by(ProjectMCP.name)
        )
        result = await self._session.execute(stmt)
        return [ProjectMcpRead.model_validate(m) for m in result.scalars().all()]

    async def get_mcp(self, project_id: uuid.UUID, mcp_id: uuid.UUID) -> ProjectMcpRead:
        mcp = await self._get_orm(project_id, mcp_id)
        return ProjectMcpRead.model_validate(mcp)

    async def create_mcp(
        self, project_id: uuid.UUID, body: ProjectMcpCreate
    ) -> ProjectMcpRead:
        mcp = ProjectMCP(
            project_id=project_id,
            name=body.name,
            slug=body.slug,
            description=body.description,
            transport=body.transport,
            command=body.command,
            args=body.args,
            env=body.env,
            url=body.url,
            headers=body.headers,
        )
        self._session.add(mcp)
        await self._session.commit()
        await self._session.refresh(mcp)
        return ProjectMcpRead.model_validate(mcp)

    async def patch_mcp(
        self, project_id: uuid.UUID, mcp_id: uuid.UUID, body: ProjectMcpPatch
    ) -> ProjectMcpRead:
        mcp = await self._get_orm(project_id, mcp_id)
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(mcp, field, value)
        await self._session.commit()
        await self._session.refresh(mcp)
        return ProjectMcpRead.model_validate(mcp)

    async def delete_mcp(self, project_id: uuid.UUID, mcp_id: uuid.UUID) -> None:
        mcp = await self._get_orm(project_id, mcp_id)
        mcp.deleted_at = datetime.now(UTC)
        await self._session.commit()

    async def clone_from_library(
        self, project_id: uuid.UUID, library_mcp_id: uuid.UUID
    ) -> ProjectMcpRead:
        result = await self._session.execute(
            select(LibraryMCP).where(
                LibraryMCP.id == library_mcp_id,
                LibraryMCP.deleted_at.is_(None),
            )
        )
        lib_mcp = result.scalar_one_or_none()
        if lib_mcp is None:
            raise NotFoundError("Library MCP not found")
        mcp = ProjectMCP(
            project_id=project_id,
            name=lib_mcp.name,
            slug=lib_mcp.slug,
            description=lib_mcp.description,
            transport=lib_mcp.transport,
            command=lib_mcp.command,
            args=lib_mcp.args,
            env=lib_mcp.env,
            url=lib_mcp.url,
            headers=lib_mcp.headers,
            cloned_from_library_mcp_id=library_mcp_id,
        )
        self._session.add(mcp)
        await self._session.commit()
        await self._session.refresh(mcp)
        return ProjectMcpRead.model_validate(mcp)

    async def _get_orm(self, project_id: uuid.UUID, mcp_id: uuid.UUID) -> ProjectMCP:
        stmt = select(ProjectMCP).where(
            ProjectMCP.id == mcp_id,
            ProjectMCP.project_id == project_id,
            ProjectMCP.deleted_at.is_(None),
        )
        result = await self._session.execute(stmt)
        mcp = result.scalar_one_or_none()
        if mcp is None:
            raise NotFoundError("Project MCP not found")
        return mcp
