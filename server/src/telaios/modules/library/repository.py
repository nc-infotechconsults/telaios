"""Library repositories — CRUD + pagination for LibraryAgent, LibraryMCP, LibrarySkill."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import cast, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from telaios.db.models.library import LibraryAgent, LibraryMCP, LibrarySkill, LibrarySkillFile


class LibraryAgentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list(
        self, *, q: str | None, role: str | None, tags: str | None, page: int, limit: int
    ) -> tuple[list[LibraryAgent], int]:
        stmt = select(LibraryAgent).where(LibraryAgent.deleted_at.is_(None))
        if role:
            stmt = stmt.where(LibraryAgent.role == role)
        if q:
            like = f"%{q}%"
            stmt = stmt.where(
                or_(LibraryAgent.name.ilike(like), LibraryAgent.description.ilike(like))
            )
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                stmt = stmt.where(LibraryAgent.tags.op("@>")(cast(json.dumps(tag_list), JSONB)))
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self._s.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(LibraryAgent.name.asc()).offset((page - 1) * limit).limit(limit)
        rows = list((await self._s.execute(stmt)).scalars().all())
        return rows, total

    async def find(self, agent_id: uuid.UUID) -> LibraryAgent | None:
        result = await self._s.execute(
            select(LibraryAgent).where(
                LibraryAgent.id == agent_id, LibraryAgent.deleted_at.is_(None)
            )
        )
        return result.scalar_one_or_none()

    async def find_by_slug(self, slug: str) -> LibraryAgent | None:
        result = await self._s.execute(
            select(LibraryAgent).where(LibraryAgent.slug == slug, LibraryAgent.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> LibraryAgent:
        obj = LibraryAgent(**kwargs)
        self._s.add(obj)
        await self._s.flush()
        await self._s.refresh(obj)
        return obj

    async def save(self, obj: LibraryAgent) -> LibraryAgent:
        await self._s.flush()
        await self._s.refresh(obj)
        return obj

    async def soft_delete(self, obj: LibraryAgent) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()

    async def increment_usage(self, agent_id: uuid.UUID) -> bool:
        result = await self._s.execute(select(LibraryAgent).where(LibraryAgent.id == agent_id))
        obj = result.scalar_one_or_none()
        if obj is None:
            return False
        obj.usage_count = (obj.usage_count or 0) + 1
        await self._s.flush()
        return True


class LibraryMcpRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list(
        self, *, q: str | None, tags: str | None, page: int, limit: int
    ) -> tuple[list[LibraryMCP], int]:
        stmt = select(LibraryMCP).where(LibraryMCP.deleted_at.is_(None))
        if q:
            like = f"%{q}%"
            stmt = stmt.where(or_(LibraryMCP.name.ilike(like), LibraryMCP.description.ilike(like)))
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                stmt = stmt.where(LibraryMCP.tags.op("@>")(cast(json.dumps(tag_list), JSONB)))
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self._s.execute(count_stmt)).scalar_one()
        stmt = stmt.order_by(LibraryMCP.name.asc()).offset((page - 1) * limit).limit(limit)
        rows = list((await self._s.execute(stmt)).scalars().all())
        return rows, total

    async def find(self, mcp_id: uuid.UUID) -> LibraryMCP | None:
        result = await self._s.execute(
            select(LibraryMCP).where(LibraryMCP.id == mcp_id, LibraryMCP.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def find_by_slug(self, slug: str) -> LibraryMCP | None:
        result = await self._s.execute(
            select(LibraryMCP).where(LibraryMCP.slug == slug, LibraryMCP.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> LibraryMCP:
        obj = LibraryMCP(**kwargs)
        self._s.add(obj)
        await self._s.flush()
        await self._s.refresh(obj)
        return obj

    async def save(self, obj: LibraryMCP) -> LibraryMCP:
        await self._s.flush()
        await self._s.refresh(obj)
        return obj

    async def soft_delete(self, obj: LibraryMCP) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()


class LibrarySkillRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def paginate(
        self, *, q: str | None, tags: str | None, page: int, limit: int
    ) -> tuple[list[LibrarySkill], int]:
        stmt = select(LibrarySkill).where(LibrarySkill.deleted_at.is_(None))
        if q:
            like = f"%{q}%"
            stmt = stmt.where(
                or_(LibrarySkill.name.ilike(like), LibrarySkill.description.ilike(like))
            )
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
            if tag_list:
                stmt = stmt.where(LibrarySkill.tags.op("@>")(cast(json.dumps(tag_list), JSONB)))
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self._s.execute(count_stmt)).scalar_one()
        stmt = (
            stmt.order_by(LibrarySkill.name.asc())
            .offset((page - 1) * limit)
            .limit(limit)
            .options(selectinload(LibrarySkill.files))
        )
        rows = list((await self._s.execute(stmt)).scalars().all())
        return rows, total

    async def find_with_files(self, skill_id: uuid.UUID) -> LibrarySkill | None:
        result = await self._s.execute(
            select(LibrarySkill)
            .where(LibrarySkill.id == skill_id, LibrarySkill.deleted_at.is_(None))
            .options(selectinload(LibrarySkill.files))
        )
        obj = result.scalar_one_or_none()
        if obj is not None:
            obj.files = [f for f in (obj.files or []) if f.deleted_at is None]
        return obj

    async def find_by_slug(self, slug: str) -> LibrarySkill | None:
        result = await self._s.execute(
            select(LibrarySkill)
            .where(LibrarySkill.slug == slug, LibrarySkill.deleted_at.is_(None))
            .options(selectinload(LibrarySkill.files))
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> LibrarySkill:
        obj = LibrarySkill(**kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(
            select(LibrarySkill)
            .where(LibrarySkill.id == obj.id)
            .options(selectinload(LibrarySkill.files))
        )
        return result.scalar_one()

    async def save(self, obj: LibrarySkill) -> LibrarySkill:
        await self._s.flush()
        result = await self._s.execute(
            select(LibrarySkill)
            .where(LibrarySkill.id == obj.id)
            .options(selectinload(LibrarySkill.files))
        )
        return result.scalar_one()

    async def soft_delete(self, obj: LibrarySkill) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()

    # ── files ────────────────────────────────────────────────────────────

    async def list_active_files(self, skill_id: uuid.UUID) -> list[LibrarySkillFile]:
        result = await self._s.execute(
            select(LibrarySkillFile).where(
                LibrarySkillFile.skill_id == skill_id,
                LibrarySkillFile.deleted_at.is_(None),
            )
        )
        return list(result.scalars().all())

    async def find_file(self, skill_id: uuid.UUID, path: str) -> LibrarySkillFile | None:
        result = await self._s.execute(
            select(LibrarySkillFile).where(
                LibrarySkillFile.skill_id == skill_id,
                LibrarySkillFile.path == path,
                LibrarySkillFile.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def create_file(self, **kwargs: object) -> LibrarySkillFile:
        obj = LibrarySkillFile(**kwargs)
        self._s.add(obj)
        await self._s.flush()
        return obj

    async def soft_delete_file(self, obj: LibrarySkillFile) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()
