"""Tasks DB repository (CRUD)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.base import ExecutableOption

from telaios.db.models.tasks import (
    Task,
    TaskDependency,
)
from telaios.db.models.tasks import (
    TaskRepository as TaskRepoModel,
)
from telaios.domain.enums import TaskStatus


class TaskRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def _load_opts(self) -> list[ExecutableOption]:
        return [
            selectinload(Task.task_repositories),
            selectinload(Task.dependencies),
            selectinload(Task.artifacts),
        ]

    async def list_by_plan(self, plan_id: uuid.UUID) -> list[Task]:
        result = await self._s.execute(
            select(Task)
            .where(Task.plan_id == plan_id, Task.deleted_at.is_(None))
            .order_by(Task.execution_order)
            .options(*self._load_opts())
        )
        return list(result.scalars().all())

    async def find(self, task_id: uuid.UUID) -> Task | None:
        result = await self._s.execute(
            select(Task)
            .where(Task.id == task_id, Task.deleted_at.is_(None))
            .options(*self._load_opts())
        )
        return result.scalar_one_or_none()

    async def find_with_deleted(self, task_id: uuid.UUID) -> Task | None:
        result = await self._s.execute(select(Task).where(Task.id == task_id))
        return result.scalar_one_or_none()

    async def create(
        self,
        plan_id: uuid.UUID,
        repository_ids: list[uuid.UUID],
        depends_on_task_ids: list[uuid.UUID],
        **kwargs: Any,
    ) -> Task:
        obj = Task(plan_id=plan_id, **kwargs)
        self._s.add(obj)
        await self._s.flush()

        for repo_id in repository_ids:
            self._s.add(TaskRepoModel(task_id=obj.id, repository_id=repo_id))
        for dep_id in depends_on_task_ids:
            self._s.add(TaskDependency(task_id=obj.id, depends_on_task_id=dep_id))
        await self._s.flush()

        result = await self._s.execute(
            select(Task).where(Task.id == obj.id).options(*self._load_opts())
        )
        return result.scalar_one()

    async def save(self, obj: Task) -> Task:
        await self._s.flush()
        result = await self._s.execute(
            select(Task).where(Task.id == obj.id).options(*self._load_opts())
        )
        return result.scalar_one()

    async def replace_repositories(
        self, task_id: uuid.UUID, repository_ids: list[uuid.UUID]
    ) -> None:
        existing = await self._s.execute(
            select(TaskRepoModel).where(TaskRepoModel.task_id == task_id)
        )
        for row in existing.scalars():
            await self._s.delete(row)
        for repo_id in repository_ids:
            self._s.add(TaskRepoModel(task_id=task_id, repository_id=repo_id))
        await self._s.flush()

    async def replace_dependencies(
        self, task_id: uuid.UUID, depends_on_task_ids: list[uuid.UUID]
    ) -> None:
        existing = await self._s.execute(
            select(TaskDependency).where(TaskDependency.task_id == task_id)
        )
        for row in existing.scalars():
            await self._s.delete(row)
        for dep_id in depends_on_task_ids:
            self._s.add(TaskDependency(task_id=task_id, depends_on_task_id=dep_id))
        await self._s.flush()

    async def soft_delete_by_plan(self, plan_id: uuid.UUID) -> int:
        result = await self._s.execute(
            select(Task).where(Task.plan_id == plan_id, Task.deleted_at.is_(None))
        )
        tasks = list(result.scalars())
        now = datetime.now(UTC)
        for t in tasks:
            t.deleted_at = now
        await self._s.flush()
        return len(tasks)

    async def cancel_by_plan(self, plan_id: uuid.UUID) -> int:
        cancellable = (TaskStatus.PENDING, TaskStatus.READY, TaskStatus.IN_PROGRESS)
        result = await self._s.execute(
            select(Task).where(
                Task.plan_id == plan_id,
                Task.status.in_(cancellable),
                Task.deleted_at.is_(None),
            )
        )
        tasks = list(result.scalars())
        for t in tasks:
            t.status = TaskStatus.CANCELLED
        await self._s.flush()
        return len(tasks)

    async def skip_dependent_tasks(self, task_id: uuid.UUID) -> int:
        """Set status='skipped' on all tasks that (directly or transitively)
        depend on *task_id* and are still in a non-terminal state."""
        # Walk dependency graph breadth-first to collect all downstream ids.
        visited: set[uuid.UUID] = set()
        frontier: list[uuid.UUID] = [task_id]
        while frontier:
            current = frontier.pop()
            if current in visited:
                continue
            visited.add(current)
            rows = await self._s.execute(
                select(TaskDependency.task_id).where(TaskDependency.depends_on_task_id == current)
            )
            for (dep_task_id,) in rows:
                if dep_task_id not in visited:
                    frontier.append(dep_task_id)

        downstream = visited - {task_id}
        if not downstream:
            return 0

        skippable = (TaskStatus.PENDING, TaskStatus.READY)
        result = await self._s.execute(
            select(Task).where(
                Task.id.in_(downstream),
                Task.status.in_(skippable),
                Task.deleted_at.is_(None),
            )
        )
        tasks = list(result.scalars())
        for t in tasks:
            t.status = TaskStatus.SKIPPED
        await self._s.flush()
        return len(tasks)

    async def soft_delete(self, obj: Task) -> None:
        obj.deleted_at = datetime.now(UTC)
        await self._s.flush()
