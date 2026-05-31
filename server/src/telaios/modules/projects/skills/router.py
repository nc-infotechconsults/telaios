"""Project skills router.

Endpoints:
  GET    /projects/{project_id}/skills            — list
  POST   /projects/{project_id}/skills            — create (editor)
  POST   /projects/{project_id}/skills/clone      — clone from library (editor)
  GET    /projects/{project_id}/skills/{skill_id} — get
  PATCH  /projects/{project_id}/skills/{skill_id} — patch (editor)
  DELETE /projects/{project_id}/skills/{skill_id} — delete (editor)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.projects.skills.schemas import (
    CloneSkillFromLibraryBody,
    ProjectSkillCreate,
    ProjectSkillPatch,
    ProjectSkillRead,
)
from telaios.modules.projects.skills.service import ProjectSkillService

project_skills_router = APIRouter(
    prefix="/projects/{project_id}/skills",
    tags=["project-skills"],
)


@project_skills_router.get(
    "", response_model=list[ProjectSkillRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_skills(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[ProjectSkillRead]:
    return await ProjectSkillService(session).list_skills(project_id)


@project_skills_router.post(
    "", status_code=201, response_model=ProjectSkillRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_skill(
    project_id: uuid.UUID,
    body: ProjectSkillCreate,
    session: AsyncSession = Depends(get_session),
) -> ProjectSkillRead:
    return await ProjectSkillService(session).create_skill(project_id, body)


# NOTE: /clone must be registered BEFORE /{skill_id} to avoid shadowing.
@project_skills_router.post(
    "/clone", status_code=201, response_model=ProjectSkillRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def clone_skill(
    project_id: uuid.UUID,
    body: CloneSkillFromLibraryBody,
    session: AsyncSession = Depends(get_session),
) -> ProjectSkillRead:
    return await ProjectSkillService(session).clone_from_library(
        project_id, body.library_skill_id
    )


@project_skills_router.get(
    "/{skill_id}", response_model=ProjectSkillRead,
    dependencies=[Depends(require_project_access("viewer"))],
)
async def get_skill(
    project_id: uuid.UUID,
    skill_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ProjectSkillRead:
    return await ProjectSkillService(session).get_skill(project_id, skill_id)


@project_skills_router.patch(
    "/{skill_id}", response_model=ProjectSkillRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def patch_skill(
    project_id: uuid.UUID,
    skill_id: uuid.UUID,
    body: ProjectSkillPatch,
    session: AsyncSession = Depends(get_session),
) -> ProjectSkillRead:
    return await ProjectSkillService(session).patch_skill(project_id, skill_id, body)


@project_skills_router.delete(
    "/{skill_id}", status_code=204,
    dependencies=[Depends(require_project_access("editor"))],
)
async def delete_skill(
    project_id: uuid.UUID,
    skill_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await ProjectSkillService(session).delete_skill(project_id, skill_id)
