"""Document versions router.

Routes:
  GET  /documents/{document_id}/versions              — list, viewer+
  POST /documents/{document_id}/versions              — create new version, editor+
  GET  /documents/{document_id}/versions/{version_id} — get, viewer+
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership
from telaios.db.session import get_session
from telaios.modules.documents.repository import DocumentRepository
from telaios.modules.documents.versions.schemas import VersionRead
from telaios.modules.documents.versions.service import VersionService
from telaios.utils.errors import NotFoundError

# ─── RBAC ─────────────────────────────────────────────────────────────────────


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


document_versions_router = APIRouter(
    prefix="/documents",
    tags=["document-versions"],
)


@document_versions_router.get(
    "/{document_id}/versions",
    response_model=list[VersionRead],
    dependencies=[Depends(_require_document_access("viewer"))],
)
async def list_versions(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[VersionRead]:
    return await VersionService(session).list_by_document(document_id)


@document_versions_router.post(
    "/{document_id}/versions",
    status_code=201,
    response_model=VersionRead,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def create_version(
    document_id: uuid.UUID,
    principal: CurrentPrincipal,
    file: UploadFile,
    change_description: Annotated[str | None, Query()] = None,
    session: AsyncSession = Depends(get_session),
) -> VersionRead:
    doc_repo = DocumentRepository(session)
    doc = await doc_repo.find_with_deleted(document_id)
    if doc is None:
        raise NotFoundError("Document not found")
    return await VersionService(session).create(
        doc.project_id,
        document_id,
        file,
        created_by=uuid.UUID(principal.id),
        change_description=change_description,
    )


@document_versions_router.get(
    "/{document_id}/versions/{version_id}",
    response_model=VersionRead,
    dependencies=[Depends(_require_document_access("viewer"))],
)
async def get_version(
    document_id: uuid.UUID,
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> VersionRead:
    _ = document_id
    return await VersionService(session).get(version_id)


__all__ = ["document_versions_router"]
