"""Library service — CRUD + skill zip export.

Ported from:
  ``data-api/src/services/libraryAgent.service.ts``
  ``data-api/src/services/libraryMcp.service.ts``
  ``data-api/src/services/librarySkill.service.ts``
"""

from __future__ import annotations

import io
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.library.repository import (
    LibraryAgentRepository,
    LibraryMcpRepository,
    LibrarySkillRepository,
)
from telaios.modules.library.schemas import (
    LibraryAgentCreate,
    LibraryAgentPage,
    LibraryAgentPatch,
    LibraryAgentQuery,
    LibraryAgentRead,
    LibraryMcpCreate,
    LibraryMcpPage,
    LibraryMcpPatch,
    LibraryMcpQuery,
    LibraryMcpRead,
    LibrarySkillCreate,
    LibrarySkillPage,
    LibrarySkillPatch,
    LibrarySkillQuery,
    LibrarySkillRead,
    SkillFileDto,
    SkillFileRead,
)
from telaios.utils.crypto import encrypt
from telaios.utils.errors import ConflictError, ForbiddenError, NotFoundError

# ── LibraryAgent ──────────────────────────────────────────────────────────────


class LibraryAgentService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = LibraryAgentRepository(session)

    async def list(self, query: LibraryAgentQuery) -> LibraryAgentPage:
        items, total = await self._repo.list(
            q=query.q, role=query.role, tags=query.tags, page=query.page, limit=query.limit
        )
        return LibraryAgentPage(
            items=[LibraryAgentRead.from_orm_sanitized(a) for a in items],
            total=total,
            page=query.page,
            limit=query.limit,
        )

    async def get(self, agent_id: uuid.UUID) -> LibraryAgentRead:
        obj = await self._repo.find(agent_id)
        if obj is None:
            raise NotFoundError("Library agent not found")
        return LibraryAgentRead.from_orm_sanitized(obj)

    async def get_by_slug(self, slug: str) -> LibraryAgentRead:
        obj = await self._repo.find_by_slug(slug)
        if obj is None:
            raise NotFoundError("Library agent not found")
        return LibraryAgentRead.from_orm_sanitized(obj)

    async def create(
        self, dto: LibraryAgentCreate, published_by: str | None = None
    ) -> LibraryAgentRead:
        existing = await self._repo.find_by_slug(dto.slug)
        if existing is not None:
            raise ConflictError(f"Slug '{dto.slug}' is already taken")

        data: dict[str, Any] = dto.model_dump(exclude_none=True)
        if data.get("llm_api_key"):
            data["llm_api_key"] = encrypt(data["llm_api_key"])
        # Convert sub_agents / mcp_servers / skills from Pydantic models to plain dicts
        for field in ("sub_agents", "mcp_servers", "skills"):
            if data.get(field):
                data[field] = [
                    v.model_dump() if hasattr(v, "model_dump") else v for v in data[field]
                ]
        data["agent_type"] = "custom"
        data["published_by"] = published_by

        obj = await self._repo.create(**data)
        return LibraryAgentRead.from_orm_sanitized(obj)

    async def patch(self, agent_id: uuid.UUID, dto: LibraryAgentPatch) -> LibraryAgentRead:
        obj = await self._repo.find(agent_id)
        if obj is None:
            raise NotFoundError("Library agent not found")
        if obj.is_base:
            raise ForbiddenError("Base agents cannot be edited directly; clone them instead")
        for field, val in dto.model_dump(exclude_unset=True).items():
            if field == "llm_api_key" and val:
                val = encrypt(val)
            elif field in ("sub_agents", "mcp_servers", "skills") and val:
                val = [v.model_dump() if hasattr(v, "model_dump") else v for v in val]
            setattr(obj, field, val)
        obj = await self._repo.save(obj)
        return LibraryAgentRead.from_orm_sanitized(obj)

    async def delete(self, agent_id: uuid.UUID) -> None:
        obj = await self._repo.find(agent_id)
        if obj is None:
            raise NotFoundError("Library agent not found")
        if obj.is_base:
            raise ForbiddenError("Base agents cannot be deleted")
        await self._repo.soft_delete(obj)

    async def clone(self, agent_id: uuid.UUID, published_by: str | None = None) -> LibraryAgentRead:
        obj = await self._repo.find(agent_id)
        if obj is None:
            raise NotFoundError("Library agent not found")
        data: dict[str, Any] = {
            "name": f"{obj.name} (Copy)",
            "slug": f"{obj.slug}-copy-{uuid.uuid4().hex[:8]}",
            "description": obj.description,
            "agent_type": "custom",
            "role": obj.role,
            "system_prompt": obj.system_prompt,
            "system_prompt_mode": obj.system_prompt_mode,
            "llm_provider": obj.llm_provider,
            "llm_model": obj.llm_model,
            "llm_temperature": obj.llm_temperature,
            "llm_max_tokens": obj.llm_max_tokens,
            "llm_api_key": obj.llm_api_key,
            "sub_agents": obj.sub_agents,
            "mcp_servers": obj.mcp_servers,
            "skills": obj.skills,
            "structured_output": obj.structured_output,
            "tags": obj.tags,
            "published_by": published_by,
            "cloned_from_id": obj.id,
        }
        new_obj = await self._repo.create(**data)
        return LibraryAgentRead.from_orm_sanitized(new_obj)

    async def increment_usage(self, agent_id: uuid.UUID) -> bool:
        return await self._repo.increment_usage(agent_id)


# ── LibraryMCP ────────────────────────────────────────────────────────────────


class LibraryMcpService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = LibraryMcpRepository(session)

    async def list(self, query: LibraryMcpQuery) -> LibraryMcpPage:
        items, total = await self._repo.list(
            q=query.q, tags=query.tags, page=query.page, limit=query.limit
        )
        return LibraryMcpPage(
            items=[LibraryMcpRead.model_validate(m, from_attributes=True) for m in items],
            total=total,
            page=query.page,
            limit=query.limit,
        )

    async def get(self, mcp_id: uuid.UUID) -> LibraryMcpRead:
        obj = await self._repo.find(mcp_id)
        if obj is None:
            raise NotFoundError("Library MCP not found")
        return LibraryMcpRead.model_validate(obj, from_attributes=True)

    async def create(
        self, dto: LibraryMcpCreate, published_by: str | None = None
    ) -> LibraryMcpRead:
        existing = await self._repo.find_by_slug(dto.slug)
        if existing is not None:
            raise ConflictError(f"Slug '{dto.slug}' is already taken")
        data = dto.model_dump(exclude_none=True)
        data["published_by"] = published_by
        obj = await self._repo.create(**data)
        return LibraryMcpRead.model_validate(obj, from_attributes=True)

    async def patch(self, mcp_id: uuid.UUID, dto: LibraryMcpPatch) -> LibraryMcpRead:
        obj = await self._repo.find(mcp_id)
        if obj is None:
            raise NotFoundError("Library MCP not found")
        for field, val in dto.model_dump(exclude_unset=True).items():
            setattr(obj, field, val)
        obj = await self._repo.save(obj)
        return LibraryMcpRead.model_validate(obj, from_attributes=True)

    async def delete(self, mcp_id: uuid.UUID) -> None:
        obj = await self._repo.find(mcp_id)
        if obj is None:
            raise NotFoundError("Library MCP not found")
        await self._repo.soft_delete(obj)


# ── LibrarySkill ──────────────────────────────────────────────────────────────


def _skill_to_read(obj: object, *, with_files: bool = False) -> LibrarySkillRead:
    read = LibrarySkillRead.model_validate(obj, from_attributes=True)
    if with_files:
        raw_files = getattr(obj, "files", []) or []
        read.files = [SkillFileRead.model_validate(f, from_attributes=True) for f in raw_files]
    else:
        read.files = None
    return read


class LibrarySkillService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = LibrarySkillRepository(session)

    async def list(self, query: LibrarySkillQuery) -> LibrarySkillPage:
        items, total = await self._repo.paginate(
            q=query.q, tags=query.tags, page=query.page, limit=query.limit
        )
        return LibrarySkillPage(
            items=[_skill_to_read(s) for s in items],
            total=total,
            page=query.page,
            limit=query.limit,
        )

    async def get(self, skill_id: uuid.UUID) -> LibrarySkillRead:
        obj = await self._repo.find_with_files(skill_id)
        if obj is None:
            raise NotFoundError("Library skill not found")
        return _skill_to_read(obj, with_files=True)

    async def create(
        self, dto: LibrarySkillCreate, published_by: str | None = None
    ) -> LibrarySkillRead:
        existing = await self._repo.find_by_slug(dto.slug)
        if existing is not None:
            raise ConflictError(f"Slug '{dto.slug}' is already taken")
        files_dto = dto.files
        data = dto.model_dump(exclude={"files"}, exclude_none=True)
        data["published_by"] = published_by
        obj = await self._repo.create(**data)
        if files_dto:
            await self._upsert_files(obj.id, files_dto)
        refreshed = await self._repo.find_with_files(obj.id)
        return _skill_to_read(refreshed, with_files=True)

    async def patch(self, skill_id: uuid.UUID, dto: LibrarySkillPatch) -> LibrarySkillRead:
        obj = await self._repo.find_with_files(skill_id)
        if obj is None:
            raise NotFoundError("Library skill not found")
        files_dto = None
        for field, val in dto.model_dump(exclude_unset=True).items():
            if field == "files":
                files_dto = val
            else:
                setattr(obj, field, val)
        await self._repo.save(obj)
        if files_dto is not None:
            await self._upsert_files(skill_id, files_dto)
        refreshed = await self._repo.find_with_files(skill_id)
        return _skill_to_read(refreshed, with_files=True)

    async def delete(self, skill_id: uuid.UUID) -> None:
        obj = await self._repo.find_with_files(skill_id)
        if obj is None:
            raise NotFoundError("Library skill not found")
        await self._repo.soft_delete(obj)

    async def export_as_zip(self, skill_id: uuid.UUID) -> tuple[bytes, str]:
        """Return ``(zip_bytes, slug)`` or raise ``NotFoundError``."""
        import zipfile

        obj = await self._repo.find_with_files(skill_id)
        if obj is None:
            raise NotFoundError("Library skill not found")

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            slug: str = obj.slug
            zf.writestr(f"{slug}/SKILL.md", _build_frontmatter(obj) + (obj.content or ""))
            for f in getattr(obj, "files", []) or []:
                zf.writestr(f"{slug}/{f.path}", f.content)

        return buf.getvalue(), slug

    async def _upsert_files(
        self, skill_id: uuid.UUID, file_dtos: Sequence[SkillFileDto | dict[str, Any]]
    ) -> None:
        existing = await self._repo.list_active_files(skill_id)
        existing_by_path = {f.path: f for f in existing}
        incoming_paths = {(d.path if isinstance(d, SkillFileDto) else d["path"]) for d in file_dtos}

        # Soft-delete removed files
        for f in existing:
            if f.path not in incoming_paths:
                await self._repo.soft_delete_file(f)

        # Upsert incoming
        for dto in file_dtos:
            path = dto.path if isinstance(dto, SkillFileDto) else dto["path"]
            content = dto.content if isinstance(dto, SkillFileDto) else dto["content"]
            existing_file = existing_by_path.get(path)
            if existing_file:
                existing_file.content = content
            else:
                await self._repo.create_file(skill_id=skill_id, path=path, content=content)


def _build_frontmatter(skill: object) -> str:
    lines = ["---"]
    lines.append(f"name: {skill.slug}")  # type: ignore[attr-defined]
    lines.append(f"description: {skill.description or ''}")  # type: ignore[attr-defined]
    if lic := getattr(skill, "license", None):
        lines.append(f"license: {lic}")
    if compat := getattr(skill, "compatibility", None):
        lines.append(f"compatibility: {compat}")
    meta: dict[str, str] = getattr(skill, "skill_metadata", None) or {}
    if meta:
        lines.append("metadata:")
        for k, v in meta.items():
            lines.append(f"  {k}: {v}")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)
