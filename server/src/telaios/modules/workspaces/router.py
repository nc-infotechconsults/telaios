"""Workspaces router.

Routes ported from ``data-api/src/routes/workspace.route.ts``:

  GET    /projects/{project_id}/workspaces   — list, viewer+
  POST   /projects/{project_id}/workspaces   — create, editor+

  GET    /workspaces/{workspace_id}           — get, viewer+ on owning project
  PATCH  /workspaces/{workspace_id}           — update, editor+ on owning project
  DELETE /workspaces/{workspace_id}           — soft-delete, editor+ on owning project

For item-scoped routes the workspace's ``project_id`` is resolved from the DB
(including soft-deleted rows so RBAC can still return 403 rather than a
spurious 404 when the workspace exists but the caller is not a member).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership, require_project_access
from telaios.db.session import get_session
from telaios.modules.workspaces.repository import WorkspaceRepository
from telaios.modules.workspaces.schemas import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate
from telaios.modules.workspaces.service import WorkspaceService
from telaios.utils.errors import NotFoundError

# ─── Item-scoped RBAC helpers ─────────────────────────────────────────────


def _require_workspace_access(min_role: str = "viewer") -> Callable[..., object]:
    """Return a FastAPI dep that enforces project membership via workspace id.

    Resolves ``project_id`` from the workspace row (including soft-deleted) so
    that callers who are not project members receive a 403 even after deletion,
    consistent with the TS middleware behaviour.
    """

    async def _dep(
        workspace_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Principal:
        repo = WorkspaceRepository(session)
        workspace = await repo.find_by_id_with_deleted(workspace_id)
        if workspace is None:
            raise NotFoundError("Workspace not found")
        await check_project_membership(workspace.project_id, principal, session, min_role)
        return principal

    return _dep


# ─── Project-scoped sub-router ────────────────────────────────────────────

project_workspaces_router = APIRouter(
    prefix="/projects/{project_id}/workspaces",
    tags=["workspaces"],
)


@project_workspaces_router.get(
    "",
    response_model=list[WorkspaceRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_workspaces(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[WorkspaceRead]:
    return await WorkspaceService(session).list_by_project(project_id)


@project_workspaces_router.post(
    "",
    status_code=201,
    response_model=WorkspaceRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_workspace(
    project_id: uuid.UUID,
    body: WorkspaceCreate,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> WorkspaceRead:
    return await WorkspaceService(session).create(
        project_id=project_id,
        dto=body,
        created_by=uuid.UUID(principal.id),
    )


# ─── Item-scoped sub-router ───────────────────────────────────────────────

workspace_router = APIRouter(
    prefix="/workspaces",
    tags=["workspaces"],
)


@workspace_router.get(
    "/{workspace_id}",
    response_model=WorkspaceRead,
    dependencies=[Depends(_require_workspace_access("viewer"))],
)
async def get_workspace(
    workspace_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> WorkspaceRead:
    return await WorkspaceService(session).get(workspace_id)


@workspace_router.patch(
    "/{workspace_id}",
    response_model=WorkspaceRead,
    dependencies=[Depends(_require_workspace_access("editor"))],
)
async def patch_workspace(
    workspace_id: uuid.UUID,
    body: WorkspaceUpdate,
    session: AsyncSession = Depends(get_session),
) -> WorkspaceRead:
    return await WorkspaceService(session).patch(workspace_id, body)


@workspace_router.delete(
    "/{workspace_id}",
    status_code=204,
    dependencies=[Depends(_require_workspace_access("editor"))],
)
async def delete_workspace(
    workspace_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await WorkspaceService(session).delete(workspace_id)


__all__ = ["project_workspaces_router", "workspace_router"]
