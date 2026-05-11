"""Plans DB repository (CRUD)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from telaios.db.models.plans import Plan


class PlanRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_by_project(self, project_id: uuid.UUID) -> list[Plan]:
        result = await self._s.execute(
            select(Plan)
            .where(
                Plan.project_id == project_id,
                Plan.deleted_at.is_(None),
            )
            .order_by(Plan.created_at.desc())
            .options(selectinload(Plan.tasks))
        )
        return list(result.scalars().all())

    async def find(self, plan_id: uuid.UUID) -> Plan | None:
        result = await self._s.execute(
            select(Plan)
            .where(Plan.id == plan_id, Plan.deleted_at.is_(None))
            .options(selectinload(Plan.tasks))
        )
        return result.scalar_one_or_none()

    async def find_with_deleted(self, plan_id: uuid.UUID) -> Plan | None:
        """Find plan regardless of soft-delete (used for RBAC resolution)."""
        result = await self._s.execute(select(Plan).where(Plan.id == plan_id))
        return result.scalar_one_or_none()

    async def create(self, project_id: uuid.UUID, **kwargs: Any) -> Plan:
        obj = Plan(project_id=project_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()
        result = await self._s.execute(
            select(Plan).where(Plan.id == obj.id).options(selectinload(Plan.tasks))
        )
        return result.scalar_one()

    async def save(self, obj: Plan) -> Plan:
        await self._s.flush()
        result = await self._s.execute(
            select(Plan).where(Plan.id == obj.id).options(selectinload(Plan.tasks))
        )
        return result.scalar_one()

    async def soft_delete(self, obj: Plan) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()
