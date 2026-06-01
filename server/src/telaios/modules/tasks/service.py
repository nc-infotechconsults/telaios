"""Tasks business-logic service."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.db.models.tasks import Task
from telaios.domain.enums import TaskStatus
from telaios.modules.tasks.repository import TaskRepository
from telaios.modules.tasks.schemas import TaskCreate, TaskPatch, TaskRead
from telaios.utils.errors import ConflictError, NotFoundError


class TaskService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = TaskRepository(session)

    async def list_by_plan(self, plan_id: uuid.UUID) -> list[TaskRead]:
        tasks = await self._repo.list_by_plan(plan_id)
        return [TaskRead.from_orm_with_relations(t) for t in tasks]

    async def list_by_project(
        self,
        project_id: uuid.UUID,
        limit: int = 20,
        statuses: list[TaskStatus] | None = None,
    ) -> list[TaskRead]:
        tasks = await self._repo.list_by_project(project_id, limit, statuses)
        return [TaskRead.from_orm_with_relations(t) for t in tasks]

    async def get(self, task_id: uuid.UUID) -> TaskRead:
        task = await self._repo.find(task_id)
        if task is None:
            raise NotFoundError("Task not found")
        return TaskRead.from_orm_with_relations(task)

    async def get_orm(self, task_id: uuid.UUID) -> Task:
        task = await self._repo.find_with_deleted(task_id)
        if task is None:
            raise NotFoundError("Task not found")
        return task

    async def create(self, plan_id: uuid.UUID, dto: TaskCreate) -> TaskRead:
        task = await self._repo.create(
            plan_id=plan_id,
            repository_ids=dto.repository_ids,
            depends_on_task_ids=dto.depends_on_task_ids,
            title=dto.title,
            description=dto.description,
            type=dto.type,
            status=dto.status,
            execution_order=dto.execution_order,
            agent_profile_id=dto.agent_profile_id,
        )
        return TaskRead.from_orm_with_relations(task)

    async def patch(self, task_id: uuid.UUID, dto: TaskPatch) -> TaskRead:
        task = await self._repo.find(task_id)
        if task is None:
            raise NotFoundError("Task not found")

        update_data = dto.model_dump(
            exclude_unset=True,
            exclude={"repository_ids", "depends_on_task_ids"},
        )
        for key, value in update_data.items():
            setattr(task, key, value)

        if dto.repository_ids is not None:
            await self._repo.replace_repositories(task_id, dto.repository_ids)

        if dto.depends_on_task_ids is not None:
            await self._repo.replace_dependencies(task_id, dto.depends_on_task_ids)

        task = await self._repo.save(task)
        return TaskRead.from_orm_with_relations(task)

    async def retry(self, task_id: uuid.UUID) -> TaskRead:
        task = await self._repo.find(task_id)
        if task is None:
            raise NotFoundError("Task not found")
        if not task.status.is_retryable:
            raise ConflictError("Only failed or cancelled tasks can be retried")
        task.status = TaskStatus.PENDING
        task = await self._repo.save(task)
        return TaskRead.from_orm_with_relations(task)

    async def cancel(self, task_id: uuid.UUID) -> TaskRead:
        task = await self._repo.find(task_id)
        if task is None:
            raise NotFoundError("Task not found")
        if not task.status.is_cancellable:
            raise ConflictError("Task cannot be cancelled")
        task.status = TaskStatus.CANCELLED
        task = await self._repo.save(task)
        return TaskRead.from_orm_with_relations(task)

    async def delete_by_plan(self, plan_id: uuid.UUID) -> int:
        """Soft-delete all tasks for a plan (called from plans.router after RBAC)."""
        return await self._repo.soft_delete_by_plan(plan_id)

    async def skip_dependent_tasks(self, task_id: uuid.UUID) -> int:
        """Skip all downstream dependents of *task_id*."""
        return await self._repo.skip_dependent_tasks(task_id)

    async def cancel_by_plan(self, plan_id: uuid.UUID) -> int:
        """Cancel all running/pending tasks for a plan (called from plans.router)."""
        return await self._repo.cancel_by_plan(plan_id)
