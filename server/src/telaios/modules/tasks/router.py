"""Tasks router.

Routes:
  GET    /plans/{plan_id}/tasks              — list, viewer+
  POST   /plans/{plan_id}/tasks              — create, editor+

  GET    /tasks/{task_id}                    — get, viewer+
  PATCH  /tasks/{task_id}                    — update, editor+
  POST   /tasks/{task_id}/retry              — retry, editor+
  POST   /tasks/{task_id}/cancel             — cancel, editor+
  GET    /tasks/{task_id}/artifacts          — list artifacts, viewer+
  POST   /tasks/{task_id}/artifacts/bulk     — create artifacts, editor+
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal, Principal
from telaios.auth.project_access import check_project_membership
from telaios.db.session import get_session
from telaios.modules.plans.repository import PlanRepository
from telaios.modules.tasks.artifacts.schemas import ArtifactRead, BulkArtifactCreate
from telaios.modules.tasks.artifacts.service import ArtifactService
from telaios.modules.tasks.repository import TaskRepository
from telaios.modules.tasks.schemas import TaskCreate, TaskPatch, TaskRead
from telaios.modules.tasks.service import TaskService
from telaios.utils.errors import NotFoundError

# ─── Item-scoped RBAC helper ──────────────────────────────────────────────────


def _require_task_access(min_role: str = "viewer") -> Callable[..., object]:
    """Dep: resolves project_id via plan row from the task row."""

    async def _dep(
        task_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Principal:
        task_repo = TaskRepository(session)
        task = await task_repo.find_with_deleted(task_id)
        if task is None:
            raise NotFoundError("Task not found")
        plan_repo = PlanRepository(session)
        plan = await plan_repo.find_with_deleted(task.plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        await check_project_membership(plan.project_id, principal, session, min_role)
        return principal

    return _dep


def _require_plan_tasks_access(min_role: str = "viewer") -> Callable[..., object]:
    """Dep: resolves project_id from plan row for plan/{plan_id}/tasks routes."""

    async def _dep(
        plan_id: uuid.UUID,
        principal: CurrentPrincipal,
        session: AsyncSession = Depends(get_session),
    ) -> Principal:
        plan_repo = PlanRepository(session)
        plan = await plan_repo.find_with_deleted(plan_id)
        if plan is None:
            raise NotFoundError("Plan not found")
        await check_project_membership(plan.project_id, principal, session, min_role)
        return principal

    return _dep


# ─── Plan-scoped tasks sub-router ─────────────────────────────────────────────

plan_tasks_router = APIRouter(
    prefix="/plans/{plan_id}/tasks",
    tags=["tasks"],
)


@plan_tasks_router.get(
    "",
    response_model=list[TaskRead],
    dependencies=[Depends(_require_plan_tasks_access("viewer"))],
)
async def list_tasks(
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[TaskRead]:
    return await TaskService(session).list_by_plan(plan_id)


@plan_tasks_router.post(
    "",
    status_code=201,
    response_model=TaskRead,
    dependencies=[Depends(_require_plan_tasks_access("editor"))],
)
async def create_task(
    plan_id: uuid.UUID,
    body: TaskCreate,
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    return await TaskService(session).create(plan_id, body)


# ─── Task-scoped sub-router ───────────────────────────────────────────────────

task_router = APIRouter(
    prefix="/tasks",
    tags=["tasks"],
)


@task_router.get(
    "/{task_id}",
    response_model=TaskRead,
    dependencies=[Depends(_require_task_access("viewer"))],
)
async def get_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    return await TaskService(session).get(task_id)


@task_router.patch(
    "/{task_id}",
    response_model=TaskRead,
    dependencies=[Depends(_require_task_access("editor"))],
)
async def patch_task(
    task_id: uuid.UUID,
    body: TaskPatch,
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    return await TaskService(session).patch(task_id, body)


@task_router.post(
    "/{task_id}/retry",
    response_model=TaskRead,
    dependencies=[Depends(_require_task_access("editor"))],
)
async def retry_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    return await TaskService(session).retry(task_id)


@task_router.post(
    "/{task_id}/cancel",
    response_model=TaskRead,
    dependencies=[Depends(_require_task_access("editor"))],
)
async def cancel_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> TaskRead:
    return await TaskService(session).cancel(task_id)


@task_router.get(
    "/{task_id}/artifacts",
    response_model=list[ArtifactRead],
    dependencies=[Depends(_require_task_access("viewer"))],
)
async def list_artifacts(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[ArtifactRead]:
    return await ArtifactService(session).list_by_task(task_id)


@task_router.post(
    "/{task_id}/artifacts/bulk",
    status_code=201,
    response_model=list[ArtifactRead],
    dependencies=[Depends(_require_task_access("editor"))],
)
async def bulk_create_artifacts(
    task_id: uuid.UUID,
    body: BulkArtifactCreate,
    session: AsyncSession = Depends(get_session),
) -> list[ArtifactRead]:
    return await ArtifactService(session).create_bulk(task_id, body.artifacts)


__all__ = ["plan_tasks_router", "task_router"]
