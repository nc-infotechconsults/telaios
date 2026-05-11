"""Project agent service."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.library import LibraryAgent
from telaios.modules.projects.agents.repository import AgentRepository
from telaios.modules.projects.schemas import AgentRead, CreateAgent, PatchAgent
from telaios.utils.crypto import encrypt
from telaios.utils.errors import NotFoundError


def _sanitize(agent: Any) -> AgentRead:
    """Strip llm_api_key and add has_llm_api_key flag."""
    data = {
        col: getattr(agent, col)
        for col in (
            "id",
            "project_id",
            "library_agent_id",
            "name",
            "role",
            "system_prompt",
            "system_prompt_mode",
            "llm_provider",
            "llm_model",
            "llm_base_url",
            "llm_temperature",
            "llm_max_tokens",
            "sub_agents",
            "mcp_servers",
            "skills",
            "structured_output",
            "scope",
            "created_at",
            "updated_at",
        )
    }
    data["has_llm_api_key"] = bool(agent.llm_api_key)
    return AgentRead.model_validate(data)


def _maybe_encrypt(dto_data: dict[str, Any]) -> dict[str, Any]:
    key = dto_data.get("llm_api_key")
    if key and isinstance(key, str):
        dto_data = {**dto_data, "llm_api_key": encrypt(key)}
    return dto_data


class AgentService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = AgentRepository(session)
        self._session = session

    async def list_agents(self, project_id: uuid.UUID) -> list[AgentRead]:
        agents = await self._repo.list(project_id)
        return [_sanitize(a) for a in agents]

    async def create_agent(self, project_id: uuid.UUID, dto: CreateAgent) -> AgentRead:
        data: dict[str, Any] = dto.model_dump(exclude_none=True)
        data = _maybe_encrypt(data)
        # Serialize nested Pydantic models to plain dicts
        for list_field in ("sub_agents", "mcp_servers", "skills"):
            if list_field in data and isinstance(data[list_field], list):
                data[list_field] = [
                    item.model_dump() if hasattr(item, "model_dump") else item
                    for item in data[list_field]
                ]
        if "structured_output" in data and hasattr(data["structured_output"], "model_dump"):
            data["structured_output"] = data["structured_output"].model_dump()

        agent = await self._repo.create(project_id=project_id, **data)
        return _sanitize(agent)

    async def clone_from_library(
        self, project_id: uuid.UUID, library_agent_id: uuid.UUID
    ) -> AgentRead:
        from sqlalchemy import select

        result = await self._session.execute(
            select(LibraryAgent).where(
                LibraryAgent.id == library_agent_id,
                LibraryAgent.deleted_at.is_(None),
            )
        )
        template = result.scalar_one_or_none()
        if template is None:
            raise NotFoundError("Library agent not found")

        agent = await self._repo.create(
            project_id=project_id,
            library_agent_id=str(library_agent_id),
            name=template.name,
            role=template.role or "custom",
            system_prompt=template.system_prompt,
            system_prompt_mode=template.system_prompt_mode,
            llm_provider=template.llm_provider,
            llm_model=template.llm_model,
            llm_api_key=None,
            llm_base_url=None,
            llm_temperature=template.llm_temperature,
            llm_max_tokens=template.llm_max_tokens,
            sub_agents=template.sub_agents,
            mcp_servers=template.mcp_servers,
            skills=template.skills,
            structured_output=template.structured_output,
            scope=None,
        )
        return _sanitize(agent)

    async def patch_agent(
        self,
        project_id: uuid.UUID,
        agent_id: uuid.UUID,
        dto: PatchAgent,
    ) -> AgentRead:
        agent = await self._repo.find(project_id, agent_id)
        if agent is None:
            raise NotFoundError("Agent not found")

        data: dict[str, Any] = dto.model_dump(exclude_unset=True)
        data = _maybe_encrypt(data)
        for list_field in ("sub_agents", "mcp_servers", "skills"):
            if list_field in data and isinstance(data[list_field], list):
                data[list_field] = [
                    item.model_dump() if hasattr(item, "model_dump") else item
                    for item in data[list_field]
                ]
        if "structured_output" in data and hasattr(data["structured_output"], "model_dump"):
            data["structured_output"] = data["structured_output"].model_dump()

        for k, v in data.items():
            setattr(agent, k, v)
        agent = await self._repo.save(agent)
        return _sanitize(agent)

    async def delete_agent(self, project_id: uuid.UUID, agent_id: uuid.UUID) -> None:
        await self._repo.delete(project_id, agent_id)

    async def list_agents_raw(self, project_id: uuid.UUID) -> list[dict[str, Any]]:
        """Return agents with raw (encrypted) llm_api_key for agent-service use."""
        agents = await self._repo.list(project_id)
        result: list[dict[str, Any]] = []
        for a in agents:
            data: dict[str, Any] = {}
            for col in a.__table__.columns:
                data[col.name] = getattr(a, col.name)
            if data.get("id") is not None:
                data["id"] = str(data["id"])
            if data.get("project_id") is not None:
                data["project_id"] = str(data["project_id"])
            result.append(data)
        return result
