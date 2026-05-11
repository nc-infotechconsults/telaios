"""Environments router.

Endpoints (all project-scoped):
  GET    /projects/{project_id}/environments
  POST   /projects/{project_id}/environments
  GET    /projects/{project_id}/environments/{env_id}
  PATCH  /projects/{project_id}/environments/{env_id}
  DELETE /projects/{project_id}/environments/{env_id}
  POST   /projects/{project_id}/environments/{env_id}/test
  GET    /projects/{project_id}/environments/{env_id}/resources
  GET    /projects/{project_id}/environments/{env_id}/resources/{kind}/{name}
  GET    /projects/{project_id}/environments/{env_id}/resources/{kind}/{name}/logs
  POST   /projects/{project_id}/environments/{env_id}/helm/install
  GET    /projects/{project_id}/environments/{env_id}/helm/releases
  PUT    /projects/{project_id}/environments/{env_id}/helm/releases/{release_name}
  DELETE /projects/{project_id}/environments/{env_id}/helm/releases/{release_name}
  GET    /projects/{project_id}/environments/{env_id}/helm/charts/scan
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.environments.schemas import (
    ConnectionTestResult,
    EnvironmentCreate,
    EnvironmentPatch,
    EnvironmentRead,
    HelmReleaseRead,
    InstallHelmChartDto,
    UpgradeHelmChartDto,
)
from telaios.modules.environments.service import EnvironmentService

environments_router = APIRouter(tags=["environments"])

_P = Depends(require_project_access("viewer"))
_E = Depends(require_project_access("editor"))
_O = Depends(require_project_access("owner"))


@environments_router.get(
    "/projects/{project_id}/environments", response_model=list[EnvironmentRead]
)
async def list_environments(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> list[EnvironmentRead]:
    return await EnvironmentService(session).list_environments(project_id)


@environments_router.post(
    "/projects/{project_id}/environments", status_code=201, response_model=EnvironmentRead
)
async def create_environment(
    project_id: uuid.UUID,
    body: EnvironmentCreate,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> EnvironmentRead:
    return await EnvironmentService(session).create_environment(project_id, body)


@environments_router.get(
    "/projects/{project_id}/environments/{env_id}", response_model=EnvironmentRead
)
async def get_environment(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> EnvironmentRead:
    return await EnvironmentService(session).get_environment(env_id, project_id)


@environments_router.patch(
    "/projects/{project_id}/environments/{env_id}", response_model=EnvironmentRead
)
async def patch_environment(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    body: EnvironmentPatch,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> EnvironmentRead:
    return await EnvironmentService(session).patch_environment(env_id, project_id, body)


@environments_router.delete("/projects/{project_id}/environments/{env_id}", status_code=204)
async def delete_environment(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("owner")),
) -> None:
    await EnvironmentService(session).delete_environment(env_id, project_id)


@environments_router.post(
    "/projects/{project_id}/environments/{env_id}/test",
    response_model=ConnectionTestResult,
)
async def test_environment_connection(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> ConnectionTestResult:
    return await EnvironmentService(session).test_connection(env_id, project_id)


@environments_router.get(
    "/projects/{project_id}/environments/{env_id}/resources",
    response_model=list[Any],
)
async def list_resources(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    namespace: str = Query(default="default"),
    kind: str = Query(default="Pod"),
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> list[Any]:
    return await EnvironmentService(session).list_resources(env_id, project_id, namespace, kind)


@environments_router.get(
    "/projects/{project_id}/environments/{env_id}/resources/{kind}/{name}",
    response_model=Any,
)
async def get_resource(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    kind: str,
    name: str,
    namespace: str = Query(default="default"),
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> Any:
    return await EnvironmentService(session).get_resource(env_id, project_id, namespace, kind, name)


@environments_router.get(
    "/projects/{project_id}/environments/{env_id}/resources/{kind}/{name}/logs",
    response_model=str,
)
async def get_resource_logs(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    kind: str,
    name: str,
    namespace: str = Query(default="default"),
    container: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> str:
    return await EnvironmentService(session).get_resource_logs(
        env_id, project_id, namespace, name, container
    )


# ── Helm ──────────────────────────────────────────────────────────────────────


@environments_router.post(
    "/projects/{project_id}/environments/{env_id}/helm/install",
    status_code=201,
    response_model=HelmReleaseRead,
)
async def install_helm_chart(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    body: InstallHelmChartDto,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> HelmReleaseRead:
    return await EnvironmentService(session).install_helm_chart(env_id, project_id, body)


@environments_router.get(
    "/projects/{project_id}/environments/{env_id}/helm/releases",
    response_model=list[HelmReleaseRead],
)
async def list_helm_releases(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> list[HelmReleaseRead]:
    return await EnvironmentService(session).list_helm_releases(env_id, project_id)


@environments_router.put(
    "/projects/{project_id}/environments/{env_id}/helm/releases/{release_name}",
    response_model=HelmReleaseRead,
)
async def upgrade_helm_release(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    release_name: str,
    body: UpgradeHelmChartDto,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> HelmReleaseRead:
    return await EnvironmentService(session).upgrade_helm_release(
        env_id, project_id, release_name, body
    )


@environments_router.delete(
    "/projects/{project_id}/environments/{env_id}/helm/releases/{release_name}",
    status_code=204,
)
async def uninstall_helm_release(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    release_name: str,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> None:
    await EnvironmentService(session).uninstall_helm_release(env_id, project_id, release_name)


@environments_router.get(
    "/projects/{project_id}/environments/{env_id}/helm/charts/scan",
    response_model=list[Any],
)
async def scan_project_charts(
    project_id: uuid.UUID,
    env_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> list[Any]:
    return await EnvironmentService(session).scan_project_charts(env_id, project_id)
