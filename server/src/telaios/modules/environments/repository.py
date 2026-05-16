"""Environments DB repository (CRUD)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from telaios.db.models.environments import Environment, HelmRelease


class EnvironmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_project(self, project_id: uuid.UUID) -> list[Environment]:
        result = await self._s.execute(
            select(Environment)
            .where(
                Environment.project_id == project_id,
                Environment.deleted_at.is_(None),
            )
            .order_by(Environment.created_at.desc())
            .options(selectinload(Environment.helm_releases))
        )
        return list(result.scalars().all())

    async def find(self, env_id: uuid.UUID, project_id: uuid.UUID) -> Environment | None:
        result = await self._s.execute(
            select(Environment)
            .where(
                Environment.id == env_id,
                Environment.project_id == project_id,
                Environment.deleted_at.is_(None),
            )
            .options(selectinload(Environment.helm_releases))
        )
        return result.scalar_one_or_none()

    async def find_with_releases(
        self, env_id: uuid.UUID, project_id: uuid.UUID
    ) -> Environment | None:
        result = await self._s.execute(
            select(Environment)
            .where(
                Environment.id == env_id,
                Environment.project_id == project_id,
                Environment.deleted_at.is_(None),
            )
            .options(selectinload(Environment.helm_releases))
        )
        return result.scalar_one_or_none()

    async def find_by_id(self, env_id: uuid.UUID) -> Environment | None:
        result = await self._s.execute(
            select(Environment)
            .where(Environment.id == env_id, Environment.deleted_at.is_(None))
            .options(selectinload(Environment.helm_releases))
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs: object) -> Environment:
        obj = Environment(**kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(
            select(Environment)
            .where(Environment.id == obj.id)
            .options(selectinload(Environment.helm_releases))
        )
        return result.scalar_one()

    async def save(self, obj: Environment) -> Environment:
        await self._s.flush()
        result = await self._s.execute(
            select(Environment)
            .where(Environment.id == obj.id)
            .options(selectinload(Environment.helm_releases))
        )
        return result.scalar_one()

    async def soft_delete(self, obj: Environment) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()

    # ── HelmRelease ───────────────────────────────────────────────────────

    async def list_releases(self, environment_id: uuid.UUID) -> list[HelmRelease]:
        result = await self._s.execute(
            select(HelmRelease)
            .where(HelmRelease.environment_id == environment_id)
            .order_by(HelmRelease.created_at.desc())
        )
        return list(result.scalars().all())

    async def find_release(
        self, environment_id: uuid.UUID, release_name: str
    ) -> HelmRelease | None:
        result = await self._s.execute(
            select(HelmRelease).where(
                HelmRelease.environment_id == environment_id,
                HelmRelease.name == release_name,
            )
        )
        return result.scalar_one_or_none()

    async def create_release(self, **kwargs: object) -> HelmRelease:
        obj = HelmRelease(**kwargs)
        self._s.add(obj)
        await self._s.flush()
        await self._s.refresh(obj)
        return obj

    async def save_release(self, obj: HelmRelease) -> HelmRelease:
        await self._s.flush()
        await self._s.refresh(obj)
        return obj
