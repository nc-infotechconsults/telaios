"""User model.

Ported from ``data-api/src/entities/User.entity.ts``.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteAuditMixin, uuid_pk
from telaios.domain.enums import SystemRole

if TYPE_CHECKING:
    from telaios.db.models.projects import ProjectMember


class User(Base, SoftDeleteAuditMixin):
    """Application user (``users`` table)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    system_role: Mapped[SystemRole] = mapped_column(
        String, nullable=False, default="member", server_default="member"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    project_memberships: Mapped[list[ProjectMember]] = relationship(
        "ProjectMember",
        back_populates="user",
        cascade="all, delete-orphan",
    )
