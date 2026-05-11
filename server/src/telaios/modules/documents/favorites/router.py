"""Document favorites router.

Routes:
  GET    /projects/{project_id}/favorites          — list user favorites, viewer+
  POST   /documents/{document_id}/favorite         — add favorite, viewer+
  DELETE /documents/{document_id}/favorite         — remove favorite, viewer+
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership, require_project_access
from telaios.db.session import get_session
from telaios.modules.documents.favorites.schemas import FavoriteRead
from telaios.modules.documents.favorites.service import FavoriteService
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


project_favorites_router = APIRouter(
    prefix="/projects/{project_id}",
    tags=["document-favorites"],
)

document_favorites_router = APIRouter(
    prefix="/documents",
    tags=["document-favorites"],
)


@project_favorites_router.get(
    "/favorites",
    response_model=list[FavoriteRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_favorites(
    project_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[FavoriteRead]:
    return await FavoriteService(session).list_by_user_in_project(
        uuid.UUID(principal.id), project_id
    )


@document_favorites_router.post(
    "/{document_id}/favorite",
    status_code=201,
    response_model=FavoriteRead,
    dependencies=[Depends(_require_document_access("viewer"))],
)
async def add_favorite(
    document_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> FavoriteRead:
    return await FavoriteService(session).add(document_id, uuid.UUID(principal.id))


@document_favorites_router.delete(
    "/{document_id}/favorite",
    status_code=204,
    dependencies=[Depends(_require_document_access("viewer"))],
)
async def remove_favorite(
    document_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> None:
    await FavoriteService(session).remove(document_id, uuid.UUID(principal.id))


__all__ = ["document_favorites_router", "project_favorites_router"]
