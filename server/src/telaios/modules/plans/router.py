"""Plans router.

Routes:
  GET    /projects/{project_id}/plans        — list, viewer+
  POST   /projects/{project_id}/plans        — create, editor+

  GET    /plans/{plan_id}                    — get, viewer+
  PATCH  /plans/{plan_id}                    — update, editor+
  DELETE /plans/{plan_id}                    — soft-delete, editor+
  DELETE /plans/{plan_id}/tasks              — bulk-delete tasks, editor+
  POST   /plans/{plan_id}/cancel             — cancel running tasks, editor+
  GET    /plans/{plan_id}/messages           — list messages, viewer+
  POST   /plans/{plan_id}/resume             — start execution, editor+ (202)
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership, require_project_access
from telaios.db.session import get_session
from telaios.modules.messages.schemas import MessageRead
from telaios.modules.messages.service import MessageService
from telaios.modules.orchestration.service import start_execution
from telaios.modules.plans.repository import PlanRepository
from telaios.modules.plans.schemas import PlanCreate, PlanPatch, PlanRead, ResumeResponse
from telaios.modules.plans.service import PlanService
from telaios.modules.tasks.service import TaskService
from telaios.utils.errors import NotFoundError

# ─── Item-scoped RBAC helper ──────────────────────────────────────────────────


def _require_plan_access(min_role: str = "viewer") -> Callable[..., object]:
    """Dep: resolves project_id from the plan row and checks membership."""

    async def _dep(
        plan_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Principal:
        repo = PlanRepository(session)
        plan = await repo.find_with_deleted(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        await check_project_membership(plan.project_id, principal, session, min_role)
        return principal

    return _dep


# ─── Project-scoped sub-router ────────────────────────────────────────────────

project_plans_router = APIRouter(
    prefix="/projects/{project_id}/plans",
    tags=["plans"],
)


@project_plans_router.get(
    "",
    response_model=list[PlanRead],
    dependencies=[Depends(require_project_access("viewer"))],
)
async def list_plans(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[PlanRead]:
    return await PlanService(session).list_by_project(project_id)


@project_plans_router.post(
    "",
    status_code=201,
    response_model=PlanRead,
    dependencies=[Depends(require_project_access("editor"))],
)
async def create_plan(
    project_id: uuid.UUID,
    body: PlanCreate,
    session: AsyncSession = Depends(get_session),
) -> PlanRead:
    return await PlanService(session).create(project_id, body)


# ─── Plan-scoped sub-router ───────────────────────────────────────────────────

plan_router = APIRouter(
    prefix="/plans",
    tags=["plans"],
)


@plan_router.get(
    "/{plan_id}",
    response_model=PlanRead,
    dependencies=[Depends(_require_plan_access("viewer"))],
)
async def get_plan(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> PlanRead:
    return await PlanService(session).get(plan_id)


@plan_router.patch(
    "/{plan_id}",
    response_model=PlanRead,
    dependencies=[Depends(_require_plan_access("editor"))],
)
async def patch_plan(
    plan_id: uuid.UUID,
    body: PlanPatch,
    session: AsyncSession = Depends(get_session),
) -> PlanRead:
    return await PlanService(session).patch(plan_id, body)


@plan_router.delete(
    "/{plan_id}",
    status_code=204,
    dependencies=[Depends(_require_plan_access("editor"))],
)
async def delete_plan(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    await PlanService(session).delete(plan_id)


@plan_router.delete(
    "/{plan_id}/tasks",
    response_model=dict[str, int],
    dependencies=[Depends(_require_plan_access("editor"))],
)
async def delete_plan_tasks(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    count = await TaskService(session).delete_by_plan(plan_id)
    return {"deleted": count}


@plan_router.post(
    "/{plan_id}/cancel",
    response_model=dict[str, int],
    dependencies=[Depends(_require_plan_access("editor"))],
)
async def cancel_plan_tasks(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    count = await TaskService(session).cancel_by_plan(plan_id)
    return {"cancelled": count}


@plan_router.get(
    "/{plan_id}/messages",
    response_model=list[MessageRead],
    dependencies=[Depends(_require_plan_access("viewer"))],
)
async def get_plan_messages(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[MessageRead]:
    return await MessageService(session).list_by_plan(plan_id)


@plan_router.post(
    "/{plan_id}/resume",
    status_code=202,
    response_model=ResumeResponse,
    dependencies=[Depends(_require_plan_access("editor"))],
)
async def resume_plan(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> ResumeResponse:
    plan_read = await PlanService(session).get(plan_id)
    _task = asyncio.create_task(start_execution(str(plan_read.project_id), str(plan_id)))  # noqa: RUF006
    return ResumeResponse(status="accepted", plan_id=plan_id)


__all__ = ["plan_router", "project_plans_router"]
