"""Agent profiles router.

Endpoints (all require authentication):
  GET    /agent-profiles
  POST   /agent-profiles
  GET    /agent-profiles/{profile_id}
  PATCH  /agent-profiles/{profile_id}
  DELETE /agent-profiles/{profile_id}
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.db.session import get_session
from telaios.modules.agent_profiles.schemas import (
    AgentProfileRead,
    CreateAgentProfileDto,
    PatchAgentProfileDto,
)
from telaios.modules.agent_profiles.service import AgentProfileService

agent_profiles_router = APIRouter(prefix="/agent-profiles", tags=["agent-profiles"])


@agent_profiles_router.get("", response_model=list[AgentProfileRead])
async def list_agent_profiles(
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> list[AgentProfileRead]:
    return await AgentProfileService(session).list()


@agent_profiles_router.post("", status_code=201, response_model=AgentProfileRead)
async def create_agent_profile(
    body: CreateAgentProfileDto,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> AgentProfileRead:
    return await AgentProfileService(session).create(body)


@agent_profiles_router.get("/{profile_id}", response_model=AgentProfileRead)
async def get_agent_profile(
    profile_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> AgentProfileRead:
    return await AgentProfileService(session).get(profile_id)


@agent_profiles_router.patch("/{profile_id}", response_model=AgentProfileRead)
async def patch_agent_profile(
    profile_id: uuid.UUID,
    body: PatchAgentProfileDto,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> AgentProfileRead:
    return await AgentProfileService(session).patch(profile_id, body)


@agent_profiles_router.delete("/{profile_id}", status_code=204)
async def delete_agent_profile(
    profile_id: uuid.UUID,
    _principal: CurrentPrincipal,
    session: AsyncSession = Depends(get_session),
) -> None:
    await AgentProfileService(session).delete(profile_id)
