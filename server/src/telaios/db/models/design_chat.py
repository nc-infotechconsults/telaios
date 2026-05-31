"""Design chat models.

Project-scoped conversational design sessions with immutable artifact revisions.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
from sqlalchemy import UUID, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteAuditMixin, uuid_fk, uuid_pk
from telaios.domain.enums import DesignMessageRole, DesignSessionStatus

if TYPE_CHECKING:
    from telaios.db.models.projects import Project


class DesignSession(Base, SoftDeleteAuditMixin):
    """Conversational UI-design session (``design_sessions`` table)."""

    __tablename__ = "design_sessions"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")
    designer_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("library_agents.id", ondelete="SET NULL"),
        nullable=True,
    )

    title: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[DesignSessionStatus] = mapped_column(
        String,
        nullable=False,
        default="active",
        server_default="active",
    )

    project: Mapped[Project] = relationship("Project", back_populates="design_sessions")
    messages: Mapped[list[DesignMessage]] = relationship(
        "DesignMessage", back_populates="session", cascade="all, delete-orphan"
    )
    artifacts: Mapped[list[DesignArtifact]] = relationship(
        "DesignArtifact", back_populates="session", cascade="all, delete-orphan"
    )


class DesignMessage(Base, SoftDeleteAuditMixin):
    """Message inside a design session (``design_messages`` table)."""

    __tablename__ = "design_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = uuid_fk("design_sessions.id")
    role: Mapped[DesignMessageRole] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    session: Mapped[DesignSession] = relationship("DesignSession", back_populates="messages")


class DesignArtifact(Base, SoftDeleteAuditMixin):
    """Generated design artifact revision (``design_artifacts`` table)."""

    __tablename__ = "design_artifacts"
    __table_args__ = (UniqueConstraint("session_id", "revision"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = uuid_fk("design_sessions.id")
    revision: Mapped[int] = mapped_column(Integer, nullable=False)

    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    html_content: Mapped[str] = mapped_column(Text, nullable=False)
    css_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    js_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    artifact_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )

    session: Mapped[DesignSession] = relationship("DesignSession", back_populates="artifacts")


__all__ = [
    "DesignArtifact",
    "DesignMessage",
    "DesignMessageRole",
    "DesignSession",
    "DesignSessionStatus",
]
