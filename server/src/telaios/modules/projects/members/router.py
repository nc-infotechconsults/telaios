"""Project members router.

Endpoints:
  GET    /projects/{project_id}/members          — list members
  POST   /projects/{project_id}/members          — add member (owner only)
  PATCH  /projects/{project_id}/members/{user_id} — update role (owner only)
  DELETE /projects/{project_id}/members/{user_id} — remove (owner only)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.projects.members.service import MemberService
from telaios.modules.projects.schemas import AddMember, MemberRead, PatchMember

members_router = APIRouter(
    prefix="/projects/{project_id}/members",
    tags=["project-members"],
)


@members_router.get("", response_model=list[MemberRead])
async def list_members(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> list[MemberRead]:
    return await MemberService(session).list_members(project_id)


@members_router.post("", status_code=201, response_model=MemberRead)
async def add_member(
    project_id: uuid.UUID,
    body: AddMember,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("owner")),
) -> MemberRead:
    return await MemberService(session).add_member(project_id, body.user_id, body.role)


@members_router.patch("/{user_id}", response_model=MemberRead)
async def patch_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    body: PatchMember,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("owner")),
) -> MemberRead:
    return await MemberService(session).patch_member(project_id, user_id, body.role)


@members_router.delete("/{user_id}", status_code=204)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("owner")),
) -> None:
    await MemberService(session).remove_member(project_id, user_id)
