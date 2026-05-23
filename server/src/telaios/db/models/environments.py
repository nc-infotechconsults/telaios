"""Environment and HelmRelease models.

Ported from ``data-api/src/entities/{Environment,HelmRelease}.entity.ts``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteMixin, TimestampMixin, uuid_fk, uuid_pk
from telaios.domain.enums import EnvironmentStatus, EnvironmentType, HelmReleaseStatus

if TYPE_CHECKING:
    from telaios.db.models.projects import Project
    from telaios.db.models.users import User


class Environment(Base, TimestampMixin, SoftDeleteMixin):
    """Deployment environment (kube/docker) (``environments`` table)."""

    __tablename__ = "environments"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")

    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[EnvironmentType] = mapped_column(
        String, nullable=False, default="kubernetes", server_default="kubernetes"
    )
    status: Mapped[EnvironmentStatus] = mapped_column(
        String, nullable=False, default="disconnected", server_default="disconnected"
    )
    connection_config: Mapped[str | None] = mapped_column(Text, nullable=True)
    namespace: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")

    project: Mapped[Project] = relationship("Project", back_populates="environments")
    creator: Mapped[User | None] = relationship("User")
    helm_releases: Mapped[list[HelmRelease]] = relationship(
        "HelmRelease", back_populates="environment", cascade="all, delete-orphan"
    )


class HelmRelease(Base, TimestampMixin):
    """Helm release record (``helm_releases`` table)."""

    __tablename__ = "helm_releases"

    id: Mapped[uuid.UUID] = uuid_pk()
    environment_id: Mapped[uuid.UUID] = uuid_fk("environments.id")
    project_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)
    chart_repo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    chart_name: Mapped[str] = mapped_column(String, nullable=False)
    chart_version: Mapped[str | None] = mapped_column(String, nullable=True)
    namespace: Mapped[str | None] = mapped_column(String, nullable=True)
    values_override: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[HelmReleaseStatus] = mapped_column(
        String, nullable=False, default="pending", server_default="pending"
    )
    release_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    deployed_by: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    environment: Mapped[Environment] = relationship("Environment", back_populates="helm_releases")
    deployer: Mapped[User | None] = relationship("User")
