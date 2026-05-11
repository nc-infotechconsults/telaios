"""Project agents router.

Endpoints:
  GET    /projects/{project_id}/agents                    — list
  POST   /projects/{project_id}/agents                    — create (editor)
  POST   /projects/{project_id}/agents/clone              — clone from library (editor)
  GET    /projects/{project_id}/agents/{agent_id}         — get
  PATCH  /projects/{project_id}/agents/{agent_id}         — patch (editor)
  DELETE /projects/{project_id}/agents/{agent_id}         — delete (editor)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.project_access import require_project_access
from telaios.db.session import get_session
from telaios.modules.projects.agents.service import AgentService
from telaios.modules.projects.schemas import AgentRead, CreateAgent, PatchAgent
from telaios.utils.errors import NotFoundError

agents_router = APIRouter(
    prefix="/projects/{project_id}/agents",
    tags=["project-agents"],
)


class CloneFromLibraryBody(BaseModel):
    library_agent_id: uuid.UUID


@agents_router.get("", response_model=list[AgentRead])
async def list_agents(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> list[AgentRead]:
    return await AgentService(session).list_agents(project_id)


@agents_router.post("", status_code=201, response_model=AgentRead)
async def create_agent(
    project_id: uuid.UUID,
    body: CreateAgent,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> AgentRead:
    return await AgentService(session).create_agent(project_id, body)


# NOTE: /clone must be registered BEFORE /{agent_id} to avoid shadowing.
@agents_router.post("/clone", status_code=201, response_model=AgentRead)
async def clone_from_library(
    project_id: uuid.UUID,
    body: CloneFromLibraryBody,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> AgentRead:
    return await AgentService(session).clone_from_library(project_id, body.library_agent_id)


@agents_router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(
    project_id: uuid.UUID,
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("viewer")),
) -> AgentRead:
    svc = AgentService(session)
    agents = await svc.list_agents(project_id)
    match = next((a for a in agents if a.id == agent_id), None)
    if match is None:
        raise NotFoundError("Agent not found")
    return match


@agents_router.patch("/{agent_id}", response_model=AgentRead)
async def patch_agent(
    project_id: uuid.UUID,
    agent_id: uuid.UUID,
    body: PatchAgent,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> AgentRead:
    return await AgentService(session).patch_agent(project_id, agent_id, body)


@agents_router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    project_id: uuid.UUID,
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _access: None = Depends(require_project_access("editor")),
) -> None:
    await AgentService(session).delete_agent(project_id, agent_id)
