"""Plan and Message models.

Ported from ``data-api/src/entities/{Plan,Message}.entity.ts``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteAuditMixin, uuid_fk, uuid_pk
from telaios.domain.enums import PlanMessageRole, PlanStatus

if TYPE_CHECKING:
    from telaios.db.models.projects import Project
    from telaios.db.models.tasks import Task


class Plan(Base, SoftDeleteAuditMixin):
    """Execution plan grouping tasks (``plans`` table)."""

    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")

    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[PlanStatus] = mapped_column(
        String, nullable=False, default="draft", server_default="draft"
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped[Project] = relationship("Project", back_populates="plans")
    tasks: Mapped[list[Task]] = relationship(
        "Task", back_populates="plan", cascade="all, delete-orphan"
    )


class Message(Base, SoftDeleteAuditMixin):
    """Chat message belonging to a project (``messages`` table)."""

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")
    plan_id: Mapped[uuid.UUID | None] = uuid_fk("plans.id", nullable=True)

    role: Mapped[PlanMessageRole] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    project: Mapped[Project] = relationship("Project", back_populates="messages")
    plan: Mapped[Plan | None] = relationship("Plan")
