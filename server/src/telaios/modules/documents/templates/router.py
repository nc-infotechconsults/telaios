"""Document templates router.

Routes:
  GET    /templates                               — list global, viewer (any auth)
  POST   /templates                               — create global, admin
  PATCH  /templates/{template_id}                 — update, admin
  DELETE /templates/{template_id}                 — delete, admin

  GET    /projects/{project_id}/templates         — list project+global, viewer+
  POST   /projects/{project_id}/templates         — create project template, editor+
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.documents.templates.schemas import TemplateCreate, TemplatePatch, TemplateRead
from telaios.modules.documents.templates.service import TemplateService
from telaios.utils.errors import ForbiddenError

templates_router = APIRouter(
    prefix="/templates",
    tags=["document-templates"],
)

project_templates_router = APIRouter(
    prefix="/projects/{project_id}/templates",
    tags=["document-templates"],
)


@templates_router.get(
    "",
    response_model=list[TemplateRead],
)
async def list_global_templates(
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[TemplateRead]:
    return await TemplateService(session).list_global()


@templates_router.post(
    "",
    status_code=201,
    response_model=TemplateRead,
)
async def create_global_template(
    body: TemplateCreate,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> TemplateRead:
    if principal.system_role != "admin":
        raise ForbiddenError("Admin access required")
    return await TemplateService(session).create(body, created_by=uuid.UUID(principal.id))


@templates_router.patch(
    "/{template_id}",
    response_model=TemplateRead,
)
async def patch_global_template(
    template_id: uuid.UUID,
    body: TemplatePatch,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> TemplateRead:
    if principal.system_role != "admin":
        raise ForbiddenError("Admin access required")
    return await TemplateService(session).patch(template_id, body)


@templates_router.delete(
    "/{template_id}",
    status_code=204,
)
async def delete_global_template(
    template_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> None:
    if principal.system_role != "admin":
        raise ForbiddenError("Admin access required")
    await TemplateService(session).delete(template_id)


@project_templates_router.get(
    "",
    response_model=list[TemplateRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_project_templates(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[TemplateRead]:
    return await TemplateService(session).list_by_project(project_id)


@project_templates_router.post(
    "",
    status_code=201,
    response_model=TemplateRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_project_template(
    project_id: uuid.UUID,
    body: TemplateCreate,
    principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> TemplateRead:
    _ = project_id
    return await TemplateService(session).create(body, created_by=uuid.UUID(principal.id))


__all__ = ["project_templates_router", "templates_router"]
