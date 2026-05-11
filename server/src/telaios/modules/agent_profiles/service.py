"""Agent profiles service.

Delegates to the ``LibraryAgent`` table and adapts the shape to the legacy
AgentProfile API contract.

Ported from ``data-api/src/services/agentProfile.service.ts``.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.library import LibraryAgent
from telaios.modules.agent_profiles.schemas import (
    AgentProfileRead,
    CreateAgentProfileDto,
    PatchAgentProfileDto,
)
from telaios.modules.library.repository import LibraryAgentRepository
from telaios.utils.crypto import decrypt, encrypt
from telaios.utils.errors import NotFoundError


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
        self._repo = LibraryAgentRepository(session)

    async def list(self) -> list[AgentProfileRead]:
        from sqlalchemy import select

        from telaios.db.models.library import LibraryAgent

        result = await self._repo._s.execute(
            select(LibraryAgent)
            .where(LibraryAgent.deleted_at.is_(None))
            .order_by(LibraryAgent.name.asc())
        )
        items = list(result.scalars().all())
        return [_sanitize(a) for a in items]

    async def get(self, profile_id: uuid.UUID) -> AgentProfileRead:
        obj = await self._repo.find(profile_id)
        if obj is None:
            raise NotFoundError("Agent profile not found")
        return _sanitize(obj)

    async def create(self, dto: CreateAgentProfileDto) -> AgentProfileRead:
        slug = (
            dto.name.lower().replace(r"[^a-z0-9]+", "-").replace(r"^-|-$", "")
            + "-"
            + str(int(time.time() * 1000))
        )
        # Replace any non-slug characters
        import re

        slug = (
            re.sub(r"[^a-z0-9]+", "-", dto.name.lower()).strip("-") + f"-{int(time.time() * 1000)}"
        )

        data: dict[str, Any] = {
            "name": dto.name,
            "slug": slug,
            "description": dto.description,
            "agent_type": "custom",
            "llm_provider": dto.llm_provider,
            "llm_model": dto.llm_model,
            "llm_api_key": encrypt(dto.llm_api_key) if dto.llm_api_key else None,
            "llm_temperature": dto.llm_temperature,
            "llm_max_tokens": dto.llm_max_tokens,
            "system_prompt": dto.system_prompt,
            "system_prompt_mode": ("append" if dto.system_prompt_mode == "extend" else "override"),
            "sub_agents": [
                {"agent_id": str(aid), "tool_name": "", "tool_description": ""}
                for aid in (dto.sub_agent_ids or [])
            ],
            "structured_output": dto.structured_output,
            "mcp_servers": [
                m.model_dump() if hasattr(m, "model_dump") else m for m in (dto.mcp_servers or [])
            ],
            "skills": [
                {"name": s.name, "description": s.description, "content": s.instructions}
                for s in (dto.skills or [])
            ],
        }
        obj = await self._repo.create(**data)
        return _sanitize(obj)

    async def patch(self, profile_id: uuid.UUID, dto: PatchAgentProfileDto) -> AgentProfileRead:
        obj = await self._repo.find(profile_id)
        if obj is None:
            raise NotFoundError("Agent profile not found")

        updates = dto.model_dump(exclude_unset=True)
        field_map: dict[str, Any] = {}

        if "name" in updates:
            field_map["name"] = updates["name"]
        if "description" in updates:
            field_map["description"] = updates["description"]
        if "llm_provider" in updates:
            field_map["llm_provider"] = updates["llm_provider"]
        if "llm_model" in updates:
            field_map["llm_model"] = updates["llm_model"]
        if "llm_api_key" in updates:
            field_map["llm_api_key"] = (
                encrypt(updates["llm_api_key"]) if updates["llm_api_key"] else None
            )
        if "llm_temperature" in updates:
            field_map["llm_temperature"] = updates["llm_temperature"]
        if "llm_max_tokens" in updates:
            field_map["llm_max_tokens"] = updates["llm_max_tokens"]
        if "system_prompt" in updates:
            field_map["system_prompt"] = updates["system_prompt"]
        if "system_prompt_mode" in updates:
            field_map["system_prompt_mode"] = (
                "append" if updates["system_prompt_mode"] == "extend" else "override"
            )
        if "sub_agent_ids" in updates:
            field_map["sub_agents"] = [
                {"agent_id": str(aid), "tool_name": "", "tool_description": ""}
                for aid in (updates["sub_agent_ids"] or [])
            ]
        if "structured_output" in updates:
            field_map["structured_output"] = updates["structured_output"]
        if "mcp_servers" in updates:
            field_map["mcp_servers"] = [
                m.model_dump() if hasattr(m, "model_dump") else m
                for m in (updates["mcp_servers"] or [])
            ]
        if "skills" in updates:
            field_map["skills"] = [
                {"name": s.name, "description": s.description, "content": s.instructions}
                if hasattr(s, "name")
                else s
                for s in (updates["skills"] or [])
            ]

        for k, v in field_map.items():
            setattr(obj, k, v)
        obj = await self._repo.save(obj)
        return _sanitize(obj)

    async def delete(self, profile_id: uuid.UUID) -> None:
        obj = await self._repo.find(profile_id)
        if obj is None:
            raise NotFoundError("Agent profile not found")
        await self._repo.soft_delete(obj)
