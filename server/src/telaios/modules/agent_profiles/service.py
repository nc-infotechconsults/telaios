"""Agent profiles service.

Delegates to the ``LibraryAgent`` table and adapts the shape to the legacy
AgentProfile API contract.

Ported from ``data-api/src/services/agentProfile.service.ts``.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.library import LibraryAgent
from telaios.modules.agent_profiles.schemas import (
    AgentProfileRead,
    CreateAgentProfileDto,
    PatchAgentProfileDto,
)
from telaios.modules.library.schemas import (
    InlineSkill,
    LibraryAgentCreate,
    LibraryAgentPatch,
    LibraryAgentQuery,
    SubAgentEntry,
)
from telaios.modules.library.service import LibraryAgentService
from telaios.utils.crypto import decrypt


def _slugify(name: str) -> str:
    return (
        re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        + f"-{int(__import__('time').time() * 1000)}"
    )


def _sanitize(obj: LibraryAgent) -> AgentProfileRead:
    raw_key = getattr(obj, "llm_api_key", None)
    has_key = bool(raw_key and decrypt(raw_key))
    raw_mode = getattr(obj, "system_prompt_mode", "override")
    mode = "extend" if raw_mode == "append" else "override"

    sub_agents: list[dict[str, Any]] = getattr(obj, "sub_agents", []) or []
    sub_agent_ids = [uuid.UUID(str(s["agent_id"])) for s in sub_agents if s.get("agent_id")]

    return AgentProfileRead(
        id=obj.id,
        name=obj.name,
        description=obj.description or "",
        agent_type=obj.agent_type,
        llm_provider=obj.llm_provider,
        llm_model=obj.llm_model,
        has_llm_api_key=has_key,
        has_github_token=False,
        llm_temperature=obj.llm_temperature,
        llm_max_tokens=obj.llm_max_tokens,
        system_prompt=obj.system_prompt,
        system_prompt_mode=mode,
        sub_agent_ids=sub_agent_ids,
        structured_output=obj.structured_output,
        mcp_servers=obj.mcp_servers or [],
        skills=obj.skills or [],
        created_at=obj.created_at,
        updated_at=obj.updated_at,
    )


class AgentProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self._svc = LibraryAgentService(session)

    async def list(self) -> list[AgentProfileRead]:
        agents = await self._svc.list(LibraryAgentQuery())
        result: list[AgentProfileRead] = []
        for a in agents.items:
            obj = await self._svc.get_orm(a.id)
            result.append(_sanitize(obj))
        return result

    async def get(self, profile_id: uuid.UUID) -> AgentProfileRead:
        obj = await self._svc.get_orm(profile_id)
        return _sanitize(obj)

    async def create(self, dto: CreateAgentProfileDto) -> AgentProfileRead:
        create_dto = LibraryAgentCreate(
            name=dto.name,
            description=dto.description,
            slug=_slugify(dto.name),
            agent_type="custom",
            llm_provider=dto.llm_provider,
            llm_model=dto.llm_model,
            llm_api_key=dto.llm_api_key,
            llm_temperature=dto.llm_temperature,
            llm_max_tokens=dto.llm_max_tokens,
            system_prompt=dto.system_prompt,
            system_prompt_mode=("append" if dto.system_prompt_mode == "extend" else "override"),
            sub_agents=[
                SubAgentEntry(agent_id=str(aid), tool_name="", tool_description="")
                for aid in (dto.sub_agent_ids or [])
            ],
            mcp_servers=dto.mcp_servers,
            skills=[
                InlineSkill(name=s.name, description=s.description, content=s.instructions)
                for s in (dto.skills or [])
            ],
            structured_output=dto.structured_output,
        )
        created = await self._svc.create(create_dto)
        obj = await self._svc.get_orm(created.id)
        return _sanitize(obj)

    async def patch(self, profile_id: uuid.UUID, dto: PatchAgentProfileDto) -> AgentProfileRead:
        patch_dto = LibraryAgentPatch()
        updates = dto.model_dump(exclude_unset=True, exclude_none=True)
        for field, val in updates.items():
            if field == "system_prompt_mode":
                setattr(patch_dto, field, "append" if val == "extend" else "override")
            elif field == "sub_agent_ids":
                setattr(
                    patch_dto,
                    field,
                    [
                        SubAgentEntry(agent_id=str(aid), tool_name="", tool_description="")
                        for aid in val
                    ],
                )
            elif field == "skills":
                setattr(
                    patch_dto,
                    field,
                    [
                        InlineSkill(
                            name=s["name"], description=s["description"], content=s["instructions"]
                        )
                        for s in val
                    ],
                )
            else:
                setattr(patch_dto, field, val)

        await self._svc.patch(profile_id, patch_dto)
        obj = await self._svc.get_orm(profile_id)
        return _sanitize(obj)

    async def delete(self, profile_id: uuid.UUID) -> None:
        await self._svc.delete(profile_id)


__all__ = ["AgentProfileService"]
