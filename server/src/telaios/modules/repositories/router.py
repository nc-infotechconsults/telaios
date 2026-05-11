"""Repositories router.

Endpoints:
  GET    /projects/{project_id}/repositories              — list (viewer)
  POST   /projects/{project_id}/repositories              — create (editor)
  GET    /projects/{project_id}/repositories/{repo_id}    — get (viewer)
  PATCH  /projects/{project_id}/repositories/{repo_id}    — update (editor)
  DELETE /projects/{project_id}/repositories/{repo_id}    — delete (editor)
  POST   /repositories/test                               — test (authenticated)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.repositories.schemas import (
    RepositoryCreate,
    RepositoryPatch,
    RepositoryRead,
    RepoTestResult,
    TestRepositoryDto,
)
from telaios.modules.repositories.service import RepositoryService, test_repository

repositories_router = APIRouter(tags=["repositories"])


@repositories_router.get("/projects/{project_id}/repositories", response_model=list[RepositoryRead])
async def list_repositories(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> list[RepositoryRead]:
    return await RepositoryService(session).list_repositories(project_id)


@repositories_router.post(
    "/projects/{project_id}/repositories", status_code=201, response_model=RepositoryRead
)
async def create_repository(
    project_id: uuid.UUID,
    body: RepositoryCreate,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> RepositoryRead:
    return await RepositoryService(session).create_repository(project_id, body)


@repositories_router.get(
    "/projects/{project_id}/repositories/{repo_id}", response_model=RepositoryRead
)
async def get_repository(
    project_id: uuid.UUID,
    repo_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> RepositoryRead:
    return await RepositoryService(session).get_repository(repo_id, project_id)


@repositories_router.patch(
    "/projects/{project_id}/repositories/{repo_id}", response_model=RepositoryRead
)
async def patch_repository(
    project_id: uuid.UUID,
    repo_id: uuid.UUID,
    body: RepositoryPatch,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> RepositoryRead:
    return await RepositoryService(session).patch_repository(repo_id, project_id, body)


@repositories_router.delete("/projects/{project_id}/repositories/{repo_id}", status_code=204)
async def delete_repository(
    project_id: uuid.UUID,
    repo_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> None:
    await RepositoryService(session).delete_repository(repo_id, project_id)


@repositories_router.post("/repositories/test", response_model=RepoTestResult)
async def test_repository_endpoint(
    body: TestRepositoryDto,
    _principal: CurrentPrincipal,
) -> RepoTestResult:
    return await test_repository(body)
