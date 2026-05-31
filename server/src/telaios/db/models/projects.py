"""Project, ProjectMember, ProjectAgent models.

Ported from ``data-api/src/entities/{Project,ProjectMember,ProjectAgent}.entity.ts``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteAuditMixin, uuid_fk, uuid_pk
from telaios.domain.enums import AgentRole, ProjectRole, ProjectStatus

if TYPE_CHECKING:
    from telaios.db.models.design_chat import DesignSession
    from telaios.db.models.documents import Document, DocumentFolder
    from telaios.db.models.environments import Environment
    from telaios.db.models.plans import Message, Plan
    from telaios.db.models.repositories import Repository
    from telaios.db.models.users import User
    from telaios.db.models.workspaces import Workspace


class Project(Base, SoftDeleteAuditMixin):
    """A telaios project (``projects`` table)."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        String, nullable=False, default="planning", server_default="planning"
    )

    members: Mapped[list[ProjectMember]] = relationship(
        "ProjectMember", back_populates="project", cascade="all, delete-orphan"
    )
    repositories: Mapped[list[Repository]] = relationship(
        "Repository", back_populates="project", cascade="all, delete-orphan"
    )
    plans: Mapped[list[Plan]] = relationship(
        "Plan", back_populates="project", cascade="all, delete-orphan"
    )
    design_sessions: Mapped[list[DesignSession]] = relationship(
        "DesignSession", cascade="all, delete-orphan"
    )
    messages: Mapped[list[Message]] = relationship(
        "Message", back_populates="project", cascade="all, delete-orphan"
    )
    agents: Mapped[list[ProjectAgent]] = relationship(
        "ProjectAgent", back_populates="project", cascade="all, delete-orphan"
    )
    workspaces: Mapped[list[Workspace]] = relationship(
        "Workspace", back_populates="project", cascade="all, delete-orphan"
    )
    environments: Mapped[list[Environment]] = relationship(
        "Environment", back_populates="project", cascade="all, delete-orphan"
    )
    documents: Mapped[list[Document]] = relationship(
        "Document", back_populates="project", cascade="all, delete-orphan"
    )
    document_folders: Mapped[list[DocumentFolder]] = relationship(
        "DocumentFolder", back_populates="project", cascade="all, delete-orphan"
    )


class ProjectMember(Base):
    """Many-to-many between users and projects (``project_members`` table)."""

    __tablename__ = "project_members"

    user_id: Mapped[uuid.UUID] = uuid_fk("users.id", primary_key=True)
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id", primary_key=True)

    role: Mapped[ProjectRole] = mapped_column(
        String, nullable=False, default="viewer", server_default="viewer"
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped[User] = relationship("User", back_populates="project_memberships")
    project: Mapped[Project] = relationship("Project", back_populates="members")


class ProjectAgent(Base, SoftDeleteAuditMixin):
    """Project-scoped agent (``project_agents`` table).

    A standalone clone of a :class:`LibraryAgent` (no live link).
    """

    __tablename__ = "project_agents"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")
    library_agent_id: Mapped[str | None] = mapped_column(String, nullable=True)

    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[AgentRole] = mapped_column(String, nullable=False)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt_mode: Mapped[str] = mapped_column(
        String, nullable=False, default="append", server_default="append"
    )

    llm_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_base_url: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)

    sub_agents: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    mcp_servers: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    skills: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    structured_output: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    scope: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    project: Mapped[Project] = relationship("Project", back_populates="agents")
