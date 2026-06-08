"""AgentOverride service — base profiles + workspace/project override CRUD."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.agent_overrides import AgentOverride
from telaios.db.models.library import LibraryAgent
from telaios.modules.agent_overrides.schemas import (
    AgentBaseProfileRead,
    AgentOverrideRead,
    AgentOverrideUpsert,
    ResolvedAgentProfile,
)
from telaios.utils.errors import NotFoundError

_OVERRIDE_FIELDS = [
    "system_prompt",
    "system_prompt_mode",
    "llm_provider",
    "llm_model",
    "llm_base_url",
    "llm_temperature",
    "llm_max_tokens",
    "llm_top_p",
    "llm_frequency_penalty",
    "llm_presence_penalty",
    "mcp_servers",
    "skills",
]


class AgentOverrideService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Base profiles ────────────────────────────────────────────────────────

    async def list_base_profiles(self) -> list[AgentBaseProfileRead]:
        result = await self._session.execute(
            select(LibraryAgent).where(LibraryAgent.is_base == True)  # noqa: E712
        )
        return [AgentBaseProfileRead.model_validate(row, from_attributes=True) for row in result.scalars()]

    async def _get_base_profile(self, base_profile_id: uuid.UUID) -> LibraryAgent:
        result = await self._session.execute(
            select(LibraryAgent).where(
                LibraryAgent.id == base_profile_id,
                LibraryAgent.is_base == True,  # noqa: E712
            )
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            raise NotFoundError("Base agent profile not found")
        return obj

    # ── Workspace-scope overrides (project_id IS NULL) ───────────────────────

    async def list_workspace_overrides(self) -> list[AgentOverrideRead]:
        result = await self._session.execute(
            select(AgentOverride).where(AgentOverride.project_id.is_(None))
        )
        return [AgentOverrideRead.model_validate(row, from_attributes=True) for row in result.scalars()]

    async def upsert_workspace_override(
        self, base_profile_id: uuid.UUID, body: AgentOverrideUpsert
    ) -> AgentOverrideRead:
        await self._get_base_profile(base_profile_id)

        result = await self._session.execute(
            select(AgentOverride).where(
                AgentOverride.base_profile_id == base_profile_id,
                AgentOverride.project_id.is_(None),
            )
        )
        override = result.scalar_one_or_none()

        if override is None:
            override = AgentOverride(
                base_profile_id=base_profile_id,
                project_id=None,
                **body.model_dump(),
            )
            self._session.add(override)
        else:
            for field, value in body.model_dump().items():
                setattr(override, field, value)

        await self._session.commit()
        await self._session.refresh(override)
        return AgentOverrideRead.model_validate(override, from_attributes=True)

    async def delete_workspace_override(self, base_profile_id: uuid.UUID) -> None:
        result = await self._session.execute(
            select(AgentOverride).where(
                AgentOverride.base_profile_id == base_profile_id,
                AgentOverride.project_id.is_(None),
            )
        )
        override = result.scalar_one_or_none()
        if override is not None:
            await self._session.delete(override)
            await self._session.commit()

    # ── Project-scope overrides ──────────────────────────────────────────────

    async def list_project_overrides(self, project_id: uuid.UUID) -> list[AgentOverrideRead]:
        result = await self._session.execute(
            select(AgentOverride).where(AgentOverride.project_id == project_id)
        )
        return [AgentOverrideRead.model_validate(row, from_attributes=True) for row in result.scalars()]

    async def upsert_project_override(
        self, project_id: uuid.UUID, base_profile_id: uuid.UUID, body: AgentOverrideUpsert
    ) -> AgentOverrideRead:
        await self._get_base_profile(base_profile_id)

        result = await self._session.execute(
            select(AgentOverride).where(
                AgentOverride.base_profile_id == base_profile_id,
                AgentOverride.project_id == project_id,
            )
        )
        override = result.scalar_one_or_none()

        if override is None:
            override = AgentOverride(
                base_profile_id=base_profile_id,
                project_id=project_id,
                **body.model_dump(),
            )
            self._session.add(override)
        else:
            for field, value in body.model_dump().items():
                setattr(override, field, value)

        await self._session.commit()
        await self._session.refresh(override)
        return AgentOverrideRead.model_validate(override, from_attributes=True)

    async def delete_project_override(
        self, project_id: uuid.UUID, base_profile_id: uuid.UUID
    ) -> None:
        result = await self._session.execute(
            select(AgentOverride).where(
                AgentOverride.base_profile_id == base_profile_id,
                AgentOverride.project_id == project_id,
            )
        )
        override = result.scalar_one_or_none()
        if override is not None:
            await self._session.delete(override)
            await self._session.commit()

    # ── Resolved profiles (consumed by TEOS) ────────────────────────────────

    async def resolved_for_project(self, project_id: uuid.UUID) -> list[ResolvedAgentProfile]:
        base_profiles = await self.list_base_profiles()

        ws_overrides_list = await self.list_workspace_overrides()
        ws_overrides: dict[uuid.UUID, AgentOverrideRead] = {
            o.base_profile_id: o for o in ws_overrides_list
        }

        proj_overrides_list = await self.list_project_overrides(project_id)
        proj_overrides: dict[uuid.UUID, AgentOverrideRead] = {
            o.base_profile_id: o for o in proj_overrides_list
        }

        return [
            self._resolve(base, ws_overrides.get(base.id), proj_overrides.get(base.id))
            for base in base_profiles
        ]

    def _resolve(
        self,
        base: AgentBaseProfileRead,
        ws_override: AgentOverrideRead | None,
        proj_override: AgentOverrideRead | None,
    ) -> ResolvedAgentProfile:
        merged: dict[str, Any] = base.model_dump()
        overridden: list[str] = []
        scope = "base"
        override_id: uuid.UUID | None = None

        for override, scope_label in [(ws_override, "workspace"), (proj_override, "project")]:
            if override is None:
                continue
            for field in _OVERRIDE_FIELDS:
                value = getattr(override, field, None)
                if value is not None:
                    merged[field] = value
                    if field not in overridden:
                        overridden.append(field)
            scope = scope_label
            override_id = override.id

        return ResolvedAgentProfile(
            **merged,
            overridden_fields=overridden,
            override_scope=scope,
            override_id=override_id,
        )
