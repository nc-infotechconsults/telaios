"""Project MCPs router.

Endpoints:
  GET    /projects/{project_id}/mcps            — list
  POST   /projects/{project_id}/mcps            — create (editor)
  POST   /projects/{project_id}/mcps/clone      — clone from library (editor)
  GET    /projects/{project_id}/mcps/{mcp_id}   — get
  PATCH  /projects/{project_id}/mcps/{mcp_id}   — patch (editor)
  DELETE /projects/{project_id}/mcps/{mcp_id}   — delete (editor)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.projects.mcps.schemas import (
    CloneMcpFromLibraryBody,
    ProjectMcpCreate,
    ProjectMcpPatch,
    ProjectMcpRead,
)
from telaios.modules.projects.mcps.service import ProjectMcpService

project_mcps_router = APIRouter(
    prefix="/projects/{project_id}/mcps",
    tags=["project-mcps"],
)


@project_mcps_router.get(
    "", response_model=list[ProjectMcpRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_mcps(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[ProjectMcpRead]:
    return await ProjectMcpService(session).list_mcps(project_id)


@project_mcps_router.post(
    "", status_code=201, response_model=ProjectMcpRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_mcp(
    project_id: uuid.UUID,
    body: ProjectMcpCreate,
    session: AsyncSession = Depends(get_session),
) -> ProjectMcpRead:
    return await ProjectMcpService(session).create_mcp(project_id, body)


# NOTE: /clone must be registered BEFORE /{mcp_id} to avoid shadowing.
@project_mcps_router.post(
    "/clone", status_code=201, response_model=ProjectMcpRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def clone_mcp(
    project_id: uuid.UUID,
    body: CloneMcpFromLibraryBody,
    session: AsyncSession = Depends(get_session),
) -> ProjectMcpRead:
    return await ProjectMcpService(session).clone_from_library(
        project_id, body.library_mcp_id
    )


@project_mcps_router.get(
    "/{mcp_id}", response_model=ProjectMcpRead,
    dependencies=[Depends(require_project_access("viewer"))],
)
async def get_mcp(
    project_id: uuid.UUID,
    mcp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ProjectMcpRead:
    return await ProjectMcpService(session).get_mcp(project_id, mcp_id)


@project_mcps_router.patch(
    "/{mcp_id}", response_model=ProjectMcpRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def patch_mcp(
    project_id: uuid.UUID,
    mcp_id: uuid.UUID,
    body: ProjectMcpPatch,
    session: AsyncSession = Depends(get_session),
) -> ProjectMcpRead:
    return await ProjectMcpService(session).patch_mcp(project_id, mcp_id, body)


@project_mcps_router.delete(
    "/{mcp_id}", status_code=204,
    dependencies=[Depends(require_project_access("editor"))],
)
async def delete_mcp(
    project_id: uuid.UUID,
    mcp_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await ProjectMcpService(session).delete_mcp(project_id, mcp_id)
