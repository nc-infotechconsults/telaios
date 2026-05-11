"""Document activities router.

Routes:
  GET /documents/{document_id}/activity     — list by doc, viewer+
  GET /projects/{project_id}/activity/documents — list by project, viewer+
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership, require_project_access
from telaios.db.session import get_session
from telaios.modules.documents.activities.schemas import ActivityRead
from telaios.modules.documents.activities.service import ActivityService
from telaios.modules.documents.repository import DocumentRepository
from telaios.utils.errors import NotFoundError


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


document_activities_router = APIRouter(
    prefix="/documents",
    tags=["document-activities"],
)

project_activities_router = APIRouter(
    prefix="/projects/{project_id}",
    tags=["document-activities"],
)


@document_activities_router.get(
    "/{document_id}/activity",
    response_model=list[ActivityRead],
    dependencies=[Depends(_require_document_access("viewer"))],
)
async def list_document_activity(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[ActivityRead]:
    return await ActivityService(session).list_by_document(document_id)


@project_activities_router.get(
    "/activity/documents",
    response_model=list[ActivityRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_project_document_activity(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[ActivityRead]:
    return await ActivityService(session).list_by_project(project_id)


__all__ = ["document_activities_router", "project_activities_router"]
