"""Projects router.

Endpoints:
  GET    /projects              — list (authenticated)
  POST   /projects              — create (authenticated)
  GET    /projects/{id}         — get (viewer)
  PATCH  /projects/{id}         — update (owner)
  DELETE /projects/{id}         — delete (owner)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.projects.schemas import (
    ProjectCreate,
    ProjectListResponse,
    ProjectPatch,
    ProjectQuery,
    ProjectRead,
)
from telaios.modules.projects.service import ProjectService

projects_router = APIRouter(prefix="/projects", tags=["projects"])


@projects_router.get("", response_model=ProjectListResponse)
async def list_projects(
    _principal: CurrentPrincipal,
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> ProjectListResponse:
    query = ProjectQuery(q=q, page=page, limit=limit)
    return await ProjectService(session).list_projects(query)


@projects_router.post("", status_code=201, response_model=ProjectRead)
async def create_project(
    body: ProjectCreate,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> ProjectRead:
    return await ProjectService(session).create_project(body, creator_id=uuid.UUID(principal.id))


@projects_router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> ProjectRead:
    return await ProjectService(session).get_project(project_id)


@projects_router.patch("/{project_id}", response_model=ProjectRead)
async def patch_project(
    project_id: uuid.UUID,
    body: ProjectPatch,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("owner")),
) -> ProjectRead:
    return await ProjectService(session).patch_project(project_id, body)


@projects_router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("owner")),
) -> None:
    await ProjectService(session).delete_project(project_id)
