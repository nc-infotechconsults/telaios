"""Document comments router.

Routes:
  GET    /documents/{document_id}/comments              — list, viewer+
  POST   /documents/{document_id}/comments              — create, editor+
  PATCH  /documents/{document_id}/comments/{comment_id} — update, editor+
  DELETE /documents/{document_id}/comments/{comment_id} — delete, editor+
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership
from telaios.db.session import get_session
from telaios.modules.documents.comments.schemas import CommentCreate, CommentPatch, CommentRead
from telaios.modules.documents.comments.service import CommentService
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


document_comments_router = APIRouter(
    prefix="/documents",
    tags=["document-comments"],
)


@document_comments_router.get(
    "/{document_id}/comments",
    response_model=list[CommentRead],
    dependencies=[Depends(_require_document_access("viewer"))],
)
async def list_comments(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[CommentRead]:
    return await CommentService(session).list_by_document(document_id)


@document_comments_router.post(
    "/{document_id}/comments",
    status_code=201,
    response_model=CommentRead,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def create_comment(
    document_id: uuid.UUID,
    body: CommentCreate,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> CommentRead:
    return await CommentService(session).create(document_id, body, user_id=uuid.UUID(principal.id))


@document_comments_router.patch(
    "/{document_id}/comments/{comment_id}",
    response_model=CommentRead,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def patch_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: CommentPatch,
    session: AsyncSession = Depends(get_session),
) -> CommentRead:
    _ = document_id
    return await CommentService(session).patch(comment_id, body)


@document_comments_router.delete(
    "/{document_id}/comments/{comment_id}",
    status_code=204,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def delete_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    _ = document_id
    await CommentService(session).delete(comment_id)


__all__ = ["document_comments_router"]
