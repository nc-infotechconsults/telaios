"""Workspace model.

Ported from ``data-api/src/entities/Workspace.entity.ts``.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteMixin, TimestampMixin, uuid_fk, uuid_pk
from telaios.domain.enums import WorkspaceStatus

if TYPE_CHECKING:
    from telaios.db.models.projects import Project
    from telaios.db.models.users import User


class Workspace(Base, TimestampMixin, SoftDeleteMixin):
    """Project workspace (``workspaces`` table)."""

    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")

    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[WorkspaceStatus] = mapped_column(
        String, nullable=False, default="idle", server_default="idle"
    )
    container_id: Mapped[str | None] = mapped_column(String, nullable=True)
    container_image: Mapped[str | None] = mapped_column(String, nullable=True)
    ide_url: Mapped[str | None] = mapped_column(String, nullable=True)
    ide_workspace_id: Mapped[str | None] = mapped_column(String, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    created_by: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")

    project: Mapped[Project] = relationship("Project", back_populates="workspaces")
    creator: Mapped[User | None] = relationship("User")
