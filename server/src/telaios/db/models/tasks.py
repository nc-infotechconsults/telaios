"""Task, TaskDependency, TaskRepository, TaskArtifact models.

Ported from ``data-api/src/entities/{Task,TaskDependency,TaskRepository,TaskArtifact}.entity.ts``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteAuditMixin, uuid_fk, uuid_pk
from telaios.domain.enums import ArtifactType, TaskStatus, TaskType

if TYPE_CHECKING:
    from telaios.db.models.plans import Plan
    from telaios.db.models.repositories import Repository


class Task(Base, SoftDeleteAuditMixin):
    """Unit of work within a Plan (``tasks`` table)."""

    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = uuid_pk()
    plan_id: Mapped[uuid.UUID] = uuid_fk("plans.id")

    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[TaskType] = mapped_column(
        String, nullable=False, default="general", server_default="general"
    )
    status: Mapped[TaskStatus] = mapped_column(
        String, nullable=False, default="pending", server_default="pending"
    )
    execution_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    agent_profile_id: Mapped[str | None] = mapped_column(String, nullable=True)
    assigned_instance_id: Mapped[str | None] = mapped_column(String, nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)

    plan: Mapped[Plan] = relationship("Plan", back_populates="tasks")
    dependencies: Mapped[list[TaskDependency]] = relationship(
        "TaskDependency",
        back_populates="task",
        foreign_keys="TaskDependency.task_id",
        cascade="all, delete-orphan",
    )
    task_repositories: Mapped[list[TaskRepository]] = relationship(
        "TaskRepository", back_populates="task", cascade="all, delete-orphan"
    )
    artifacts: Mapped[list[TaskArtifact]] = relationship("TaskArtifact", back_populates="task")


class TaskDependency(Base):
    """Task-to-task dependency edge (``task_dependencies`` table).

    Legacy schema: ``depends_on_task_id`` is a plain PK column without a
    declared foreign key — preserved here to keep Alembic in-sync with
    the legacy TypeORM table definition.
    """

    __tablename__ = "task_dependencies"

    task_id: Mapped[uuid.UUID] = uuid_fk("tasks.id", primary_key=True)
    depends_on_task_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, nullable=False
    )

    task: Mapped[Task] = relationship("Task", back_populates="dependencies", foreign_keys=[task_id])


class TaskRepository(Base):
    """Task ↔ Repository association (``task_repositories`` table)."""

    __tablename__ = "task_repositories"

    task_id: Mapped[uuid.UUID] = uuid_fk("tasks.id", primary_key=True)
    repository_id: Mapped[uuid.UUID] = uuid_fk("repositories.id", primary_key=True)

    task: Mapped[Task] = relationship("Task", back_populates="task_repositories")
    repository: Mapped[Repository] = relationship("Repository", back_populates="task_repositories")


class TaskArtifact(Base, SoftDeleteAuditMixin):
    """Output artifact attached to a task (``task_artifacts`` table)."""

    __tablename__ = "task_artifacts"

    id: Mapped[uuid.UUID] = uuid_pk()
    task_id: Mapped[uuid.UUID] = uuid_fk("tasks.id")

    type: Mapped[ArtifactType] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(
        String, nullable=False, default="text/plain", server_default="text/plain"
    )
    artifact_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    task: Mapped[Task] = relationship("Task", back_populates="artifacts")
