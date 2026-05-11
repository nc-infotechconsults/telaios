"""Task Pydantic schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

TaskType = Literal["code", "test", "review", "general", "knowledge", "infra"]
TaskStatus = Literal["pending", "ready", "in_progress", "done", "failed", "cancelled", "skipped"]


# ── Request DTOs ──────────────────────────────────────────────────────────────


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    type: TaskType = "general"
    status: TaskStatus = "pending"
    execution_order: int = 0
    agent_profile_id: str | None = None
    repository_ids: list[uuid.UUID] = []
    depends_on_task_ids: list[uuid.UUID] = []


class TaskPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    type: TaskType | None = None
    status: TaskStatus | None = None
    execution_order: int | None = None
    agent_profile_id: str | None = None
    assigned_instance_id: str | None = None
    result: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    task_metadata: dict[str, Any] | None = None
    repository_ids: list[uuid.UUID] | None = None
    depends_on_task_ids: list[uuid.UUID] | None = None


# ── Response ──────────────────────────────────────────────────────────────────


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    title: str
    description: str | None
    type: TaskType
    status: TaskStatus
    execution_order: int
    agent_profile_id: str | None
    assigned_instance_id: str | None
    result: str | None
    started_at: datetime | None
    completed_at: datetime | None
    task_metadata: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    repository_ids: list[uuid.UUID] = []
    depends_on_task_ids: list[uuid.UUID] = []

    @classmethod
    def from_orm_with_relations(cls, task: object) -> TaskRead:
        """Build from ORM Task, deriving repository_ids and depends_on_task_ids."""
        from telaios.db.models.tasks import Task as TaskModel

        t: TaskModel = task  # type: ignore[assignment]
        obj = cls.model_validate(t)
        obj.repository_ids = [tr.repository_id for tr in t.task_repositories]
        obj.depends_on_task_ids = [d.depends_on_task_id for d in t.dependencies]
        return obj


__all__ = ["TaskCreate", "TaskPatch", "TaskRead", "TaskStatus", "TaskType"]
