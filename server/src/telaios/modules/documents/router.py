"""Documents router.

Routes:
  GET    /projects/{project_id}/documents           — list, viewer+
  POST   /projects/{project_id}/documents/upload    — upload file, editor+

  GET    /documents/{document_id}                   — get, viewer+
  PATCH  /documents/{document_id}                   — update, editor+
  DELETE /documents/{document_id}                   — soft-delete, editor+
  POST   /documents/{document_id}/trash             — move to trash, editor+
  POST   /documents/{document_id}/restore           — restore from trash, editor+
  GET    /documents/{document_id}/download          — presigned URL, viewer+
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership, require_project_access
from telaios.db.session import get_session
from telaios.modules.documents.repository import DocumentRepository
from telaios.modules.documents.schemas import (
    DocumentPatch,
    DocumentRead,
    PresignedDownloadResponse,
)
from telaios.modules.documents.service import DocumentService
from telaios.utils.errors import NotFoundError

# ─── Item-scoped RBAC ─────────────────────────────────────────────────────────


def _require_document_access(min_role: str = "viewer") -> Callable[..., object]:
    async def _dep(
        document_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Principal:
        repo = DocumentRepository(session)
        doc = await repo.find_with_deleted(document_id)
        if doc is None:
            raise NotFoundError("Document not found")
        await check_project_membership(doc.project_id, principal, session, min_role)
        return principal

    return _dep


# ─── Project-scoped router ────────────────────────────────────────────────────

project_documents_router = APIRouter(
    prefix="/projects/{project_id}/documents",
    tags=["documents"],
)


@project_documents_router.get(
    "",
    response_model=list[DocumentRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_documents(
    project_id: uuid.UUID,
    folder_id: Annotated[uuid.UUID | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    session: AsyncSession = Depends(get_session),
) -> list[DocumentRead]:
    return await DocumentService(session).list_by_project(
        project_id, folder_id=folder_id, status=status
    )


@project_documents_router.post(
    "/upload",
    status_code=201,
    response_model=DocumentRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def upload_document(
    project_id: uuid.UUID,
    principal: CurrentPrincipal,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    folder_id: Annotated[uuid.UUID | None, Query()] = None,
    session: AsyncSession = Depends(get_session),
) -> DocumentRead:
    svc = DocumentService(session)
    doc = await svc.upload(
        project_id,
        file,
        uploaded_by=uuid.UUID(principal.id),
        folder_id=folder_id,
    )
    background_tasks.add_task(svc.process, doc.id, project_id)
    return doc


# ─── Document-scoped router ───────────────────────────────────────────────────

document_router = APIRouter(
    prefix="/documents",
    tags=["documents"],
)


@document_router.get(
    "/{document_id}",
    response_model=DocumentRead,
    dependencies=[Depends(_require_document_access("viewer"))],
)
async def get_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentRead:
    return await DocumentService(session).get(document_id)


@document_router.patch(
    "/{document_id}",
    response_model=DocumentRead,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def patch_document(
    document_id: uuid.UUID,
    body: DocumentPatch,
    session: AsyncSession = Depends(get_session),
) -> DocumentRead:
    return await DocumentService(session).patch(document_id, body)


@document_router.delete(
    "/{document_id}",
    status_code=204,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def delete_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await DocumentService(session).delete(document_id)


@document_router.post(
    "/{document_id}/trash",
    response_model=DocumentRead,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def trash_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentRead:
    return await DocumentService(session).trash(document_id)


@document_router.post(
    "/{document_id}/restore",
    response_model=DocumentRead,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def restore_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> DocumentRead:
    return await DocumentService(session).restore(document_id)


@document_router.get(
    "/{document_id}/download",
    response_model=PresignedDownloadResponse,
    dependencies=[Depends(_require_document_access("viewer"))],
)
async def presigned_download(
    document_id: uuid.UUID,
    expires_in: Annotated[int, Query(ge=60, le=86400)] = 3600,
    session: AsyncSession = Depends(get_session),
) -> PresignedDownloadResponse:
    return await DocumentService(session).presigned_download(document_id, expires_in)


__all__ = ["document_router", "project_documents_router"]
