"""ProjectSkill and ProjectMCP ORM models.

Project-scoped resources that extend or clone from the global library.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteAuditMixin, uuid_fk, uuid_pk
from telaios.domain.enums import McpTransport

if TYPE_CHECKING:
    from telaios.db.models.projects import Project


class ProjectSkill(Base, SoftDeleteAuditMixin):
    """Project-scoped skill (``project_skills`` table)."""

    __tablename__ = "project_skills"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")
    cloned_from_library_skill_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("library_skills.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    project: Mapped[Project] = relationship("Project", back_populates="skills")


class ProjectMCP(Base, SoftDeleteAuditMixin):
    """Project-scoped MCP server (``project_mcps`` table)."""

    __tablename__ = "project_mcps"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")
    cloned_from_library_mcp_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("library_mcps.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    transport: Mapped[McpTransport] = mapped_column(
        String(30), nullable=False, default="stdio", server_default="stdio"
    )
    command: Mapped[str | None] = mapped_column(String, nullable=True)
    args: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    env: Mapped[dict[str, str]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    url: Mapped[str | None] = mapped_column(String, nullable=True)
    headers: Mapped[dict[str, str]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    project: Mapped[Project] = relationship("Project", back_populates="mcps")
