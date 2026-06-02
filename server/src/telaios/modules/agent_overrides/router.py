"""Agent overrides router.

Endpoints:

Base profiles — global (no workspace scope needed for admin view):
  GET  /agent-base-profiles

Workspace-level overrides — global (project_id IS NULL):
  GET     /agent-overrides
  PUT     /agent-overrides/{base_profile_id}
  DELETE  /agent-overrides/{base_profile_id}

Base profiles — workspace-scoped (auth only, returns same data):
  GET  /workspaces/{workspace_id}/agent-base-profiles

Workspace-level overrides — workspace-scoped (auth only):
  GET     /workspaces/{workspace_id}/agent-overrides
  PUT     /workspaces/{workspace_id}/agent-overrides/{base_profile_id}
  DELETE  /workspaces/{workspace_id}/agent-overrides/{base_profile_id}

Project-level overrides:
  GET     /projects/{project_id}/agent-overrides
  PUT     /projects/{project_id}/agent-overrides/{base_profile_id}
  DELETE  /projects/{project_id}/agent-overrides/{base_profile_id}
  GET     /projects/{project_id}/agent-profiles/resolved
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.db.session import get_session
from telaios.modules.agent_overrides.schemas import (
    AgentBaseProfileRead,
    AgentOverrideRead,
    AgentOverrideUpsert,
    ResolvedAgentProfile,
)
from telaios.modules.agent_overrides.service import AgentOverrideService

# ── Base profiles ─────────────────────────────────────────────────────────────

agent_base_profiles_router = APIRouter(
    prefix="/workspaces/{workspace_id}",
    tags=["agent-overrides"],
)


@agent_base_profiles_router.get(
    "/agent-base-profiles",
    response_model=list[AgentBaseProfileRead],
)
async def list_agent_base_profiles(
    workspace_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[AgentBaseProfileRead]:
    return await AgentOverrideService(session).list_base_profiles()


# ── Workspace-level overrides ─────────────────────────────────────────────────

workspace_agent_overrides_router = APIRouter(
    prefix="/workspaces/{workspace_id}",
    tags=["agent-overrides"],
)


@workspace_agent_overrides_router.get(
    "/agent-overrides",
    response_model=list[AgentOverrideRead],
)
async def list_workspace_agent_overrides(
    workspace_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[AgentOverrideRead]:
    return await AgentOverrideService(session).list_workspace_overrides()


@workspace_agent_overrides_router.put(
    "/agent-overrides/{base_profile_id}",
    response_model=AgentOverrideRead,
)
async def upsert_workspace_agent_override(
    workspace_id: uuid.UUID,
    base_profile_id: uuid.UUID,
    body: AgentOverrideUpsert,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> AgentOverrideRead:
    return await AgentOverrideService(session).upsert_workspace_override(
        base_profile_id, body
    )


@workspace_agent_overrides_router.delete(
    "/agent-overrides/{base_profile_id}",
    status_code=204,
)
async def delete_workspace_agent_override(
    workspace_id: uuid.UUID,
    base_profile_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> None:
    await AgentOverrideService(session).delete_workspace_override(base_profile_id)


# ── Global endpoints (no workspace scope — for admin view) ────────────────────

global_agent_profiles_router = APIRouter(tags=["agent-overrides"])


@global_agent_profiles_router.get(
    "/agent-base-profiles",
    response_model=list[AgentBaseProfileRead],
)
async def list_agent_base_profiles_global(
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[AgentBaseProfileRead]:
    return await AgentOverrideService(session).list_base_profiles()


@global_agent_profiles_router.get(
    "/agent-overrides",
    response_model=list[AgentOverrideRead],
)
async def list_workspace_agent_overrides_global(
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[AgentOverrideRead]:
    return await AgentOverrideService(session).list_workspace_overrides()


@global_agent_profiles_router.put(
    "/agent-overrides/{base_profile_id}",
    response_model=AgentOverrideRead,
)
async def upsert_workspace_agent_override_global(
    base_profile_id: uuid.UUID,
    body: AgentOverrideUpsert,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> AgentOverrideRead:
    return await AgentOverrideService(session).upsert_workspace_override(
        base_profile_id, body
    )


@global_agent_profiles_router.delete(
    "/agent-overrides/{base_profile_id}",
    status_code=204,
)
async def delete_workspace_agent_override_global(
    base_profile_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> None:
    await AgentOverrideService(session).delete_workspace_override(base_profile_id)


# ── Project-level overrides ───────────────────────────────────────────────────

project_agent_overrides_router = APIRouter(
    prefix="/projects/{project_id}",
    tags=["agent-overrides"],
)


@project_agent_overrides_router.get(
    "/agent-overrides",
    response_model=list[AgentOverrideRead],
)
async def list_project_agent_overrides(
    project_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[AgentOverrideRead]:
    return await AgentOverrideService(session).list_project_overrides(project_id)


@project_agent_overrides_router.put(
    "/agent-overrides/{base_profile_id}",
    response_model=AgentOverrideRead,
)
async def upsert_project_agent_override(
    project_id: uuid.UUID,
    base_profile_id: uuid.UUID,
    body: AgentOverrideUpsert,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> AgentOverrideRead:
    return await AgentOverrideService(session).upsert_project_override(
        project_id, base_profile_id, body
    )


@project_agent_overrides_router.delete(
    "/agent-overrides/{base_profile_id}",
    status_code=204,
)
async def delete_project_agent_override(
    project_id: uuid.UUID,
    base_profile_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> None:
    await AgentOverrideService(session).delete_project_override(
        project_id, base_profile_id
    )


@project_agent_overrides_router.get(
    "/agent-profiles/resolved",
    response_model=list[ResolvedAgentProfile],
)
async def get_resolved_agent_profiles(
    project_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[ResolvedAgentProfile]:
    return await AgentOverrideService(session).resolved_for_project(project_id)
