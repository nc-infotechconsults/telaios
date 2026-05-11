"""Document tags router.

Routes:
  GET    /projects/{project_id}/tags              — list tags, viewer+
  POST   /projects/{project_id}/tags              — create tag, editor+
  PATCH  /projects/{project_id}/tags/{tag_id}     — update tag, editor+
  DELETE /projects/{project_id}/tags/{tag_id}     — delete tag, editor+

  POST   /documents/{document_id}/tags/{tag_id}   — assign tag, editor+
  DELETE /documents/{document_id}/tags/{tag_id}   — remove tag, editor+
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership, require_project_access
from telaios.db.session import get_session
from telaios.modules.documents.repository import DocumentRepository
from telaios.modules.documents.tags.schemas import TagCreate, TagPatch, TagRead
from telaios.modules.documents.tags.service import TagService
from telaios.utils.errors import NotFoundError

# ─── RBAC helpers ─────────────────────────────────────────────────────────────


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


# ─── Project-scoped tags router ───────────────────────────────────────────────

project_tags_router = APIRouter(
    prefix="/projects/{project_id}/tags",
    tags=["document-tags"],
)


@project_tags_router.get(
    "",
    response_model=list[TagRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_tags(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[TagRead]:
    return await TagService(session).list_by_project(project_id)


@project_tags_router.post(
    "",
    status_code=201,
    response_model=TagRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_tag(
    project_id: uuid.UUID,
    body: TagCreate,
    session: AsyncSession = Depends(get_session),
) -> TagRead:
    return await TagService(session).create(project_id, body)


@project_tags_router.patch(
    "/{tag_id}",
    response_model=TagRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def patch_tag(
    project_id: uuid.UUID,
    tag_id: uuid.UUID,
    body: TagPatch,
    session: AsyncSession = Depends(get_session),
) -> TagRead:
    _ = project_id
    return await TagService(session).patch(tag_id, body)


@project_tags_router.delete(
    "/{tag_id}",
    status_code=204,
    dependencies=[Depends(require_project_access("editor"))],
)
async def delete_tag(
    project_id: uuid.UUID,
    tag_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    _ = project_id
    await TagService(session).delete(tag_id)


# ─── Document-tag assignment router ──────────────────────────────────────────

document_tags_router = APIRouter(
    prefix="/documents",
    tags=["document-tags"],
)


@document_tags_router.post(
    "/{document_id}/tags/{tag_id}",
    status_code=204,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def assign_tag(
    document_id: uuid.UUID,
    tag_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await TagService(session).add_to_document(document_id, tag_id)


@document_tags_router.delete(
    "/{document_id}/tags/{tag_id}",
    status_code=204,
    dependencies=[Depends(_require_document_access("editor"))],
)
async def remove_tag(
    document_id: uuid.UUID,
    tag_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await TagService(session).remove_from_document(document_id, tag_id)


__all__ = ["document_tags_router", "project_tags_router"]
