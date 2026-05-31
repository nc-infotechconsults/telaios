"""Repository model.

Ported from ``data-api/src/entities/Repository.entity.ts``.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteAuditMixin, uuid_fk, uuid_pk
from telaios.domain.enums import RepositoryAuthType, RepositoryProviderType, RepositoryStatus

if TYPE_CHECKING:
    from telaios.db.models.projects import Project
    from telaios.db.models.tasks import TaskRepository


class Repository(Base, SoftDeleteAuditMixin):
    """Git/S3 repository attached to a project (``repositories`` table)."""

    __tablename__ = "repositories"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")

    name: Mapped[str] = mapped_column(String, nullable=False)
    remote_url: Mapped[str | None] = mapped_column(String, nullable=True)
    branch: Mapped[str] = mapped_column(
        String, nullable=False, default="main", server_default="main"
    )
    auth_type: Mapped[RepositoryAuthType] = mapped_column(
        String, nullable=False, default="none", server_default="none"
    )
    credentials: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_type: Mapped[RepositoryProviderType] = mapped_column(
        String, nullable=False, default="git", server_default="git"
    )

    bucket_name: Mapped[str | None] = mapped_column(String, nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    endpoint: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[RepositoryStatus] = mapped_column(
        String, nullable=False, default="unconfigured", server_default="unconfigured"
    )
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)

    project: Mapped[Project] = relationship("Project", back_populates="repositories")
    task_repositories: Mapped[list[TaskRepository]] = relationship(
        "TaskRepository", back_populates="repository", cascade="all, delete-orphan"
    )
