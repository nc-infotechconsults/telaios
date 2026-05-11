"""Plans business-logic service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.plans import Plan
from telaios.modules.plans.repository import PlanRepository
from telaios.modules.plans.schemas import PlanCreate, PlanPatch, PlanRead
from telaios.utils.errors import NotFoundError


class PlanService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = PlanRepository(session)

    async def list_by_project(self, project_id: uuid.UUID) -> list[PlanRead]:
        plans = await self._repo.list_by_project(project_id)
        return [PlanRead.model_validate(p) for p in plans]

    async def get(self, plan_id: uuid.UUID) -> PlanRead:
        plan = await self._repo.find(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        return PlanRead.model_validate(plan)

    async def get_orm(self, plan_id: uuid.UUID) -> Plan:
        """Return the raw ORM object (used for RBAC resolution)."""
        plan = await self._repo.find_with_deleted(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        return plan

    async def create(self, project_id: uuid.UUID, dto: PlanCreate) -> PlanRead:
        plan = await self._repo.create(
            project_id=project_id,
            title=dto.title,
            status=dto.status,
        )
        return PlanRead.model_validate(plan)

    async def patch(self, plan_id: uuid.UUID, dto: PlanPatch) -> PlanRead:
        plan = await self._repo.find(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")

        update = dto.model_dump(exclude_unset=True)
        for key, value in update.items():
            setattr(plan, key, value)

        plan = await self._repo.save(plan)
        return PlanRead.model_validate(plan)

    async def delete(self, plan_id: uuid.UUID) -> None:
        plan = await self._repo.find(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        await self._repo.soft_delete(plan)
