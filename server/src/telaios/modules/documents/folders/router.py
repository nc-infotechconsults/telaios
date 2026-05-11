"""Document folders router.

Routes:
  GET    /projects/{project_id}/folders          — list, viewer+
  POST   /projects/{project_id}/folders          — create, editor+
  GET    /projects/{project_id}/folders/{id}     — get, viewer+
  PATCH  /projects/{project_id}/folders/{id}     — update, editor+
  DELETE /projects/{project_id}/folders/{id}     — soft-delete, editor+
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.documents.folders.schemas import FolderCreate, FolderPatch, FolderRead
from telaios.modules.documents.folders.service import FolderService

project_folders_router = APIRouter(
    prefix="/projects/{project_id}/folders",
    tags=["document-folders"],
)


@project_folders_router.get(
    "",
    response_model=list[FolderRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_folders(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[FolderRead]:
    return await FolderService(session).list_by_project(project_id)


@project_folders_router.post(
    "",
    status_code=201,
    response_model=FolderRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_folder(
    project_id: uuid.UUID,
    body: FolderCreate,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> FolderRead:
    return await FolderService(session).create(project_id, body, created_by=uuid.UUID(principal.id))


@project_folders_router.get(
    "/{folder_id}",
    response_model=FolderRead,
    dependencies=[Depends(require_project_access("viewer"))],
)
async def get_folder(
    project_id: uuid.UUID,
    folder_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> FolderRead:
    _ = project_id
    return await FolderService(session).get(folder_id)


@project_folders_router.patch(
    "/{folder_id}",
    response_model=FolderRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def patch_folder(
    project_id: uuid.UUID,
    folder_id: uuid.UUID,
    body: FolderPatch,
    session: AsyncSession = Depends(get_session),
) -> FolderRead:
    _ = project_id
    return await FolderService(session).patch(folder_id, body)


@project_folders_router.delete(
    "/{folder_id}",
    status_code=204,
    dependencies=[Depends(require_project_access("editor"))],
)
async def delete_folder(
    project_id: uuid.UUID,
    folder_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    _ = project_id
    await FolderService(session).delete(folder_id)


__all__ = ["project_folders_router"]
