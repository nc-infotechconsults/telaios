"""Library models: ``LibraryAgent``, ``LibraryMCP``, ``LibrarySkill``, ``LibrarySkillFile``.

Ported from ``data-api/src/entities/Library*.entity.ts``.
"""

from __future__ import annotations

import uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy import UUID, Boolean, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteAuditMixin, uuid_fk, uuid_pk
from telaios.domain.enums import AgentType, McpTransport, SystemPromptMode


class LibraryAgent(Base, SoftDeleteAuditMixin):
    """Reusable agent definition (``library_agents`` table)."""

    __tablename__ = "library_agents"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_type: Mapped[AgentType] = mapped_column(
        String, nullable=False, default="custom", server_default="custom"
    )
    role: Mapped[str | None] = mapped_column(String, nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt_mode: Mapped[SystemPromptMode] = mapped_column(
        String, nullable=False, default="append", server_default="append"
    )

    llm_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dispatch: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_top_p: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_frequency_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_presence_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_base: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    cloned_from_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        sa.ForeignKey("library_agents.id", ondelete="SET NULL"),
        nullable=True,
    )

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
    tags: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )

    published_by: Mapped[str | None] = mapped_column(String, nullable=True)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    version: Mapped[str] = mapped_column(
        String, nullable=False, default="1.0.0", server_default="1.0.0"
    )


class LibraryMCP(Base, SoftDeleteAuditMixin):
    """Reusable MCP server definition (``library_mcps`` table)."""

    __tablename__ = "library_mcps"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    transport: Mapped[McpTransport] = mapped_column(
        String, nullable=False, default="stdio", server_default="stdio"
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
    tags: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    published_by: Mapped[str | None] = mapped_column(String, nullable=True)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    version: Mapped[str] = mapped_column(
        String, nullable=False, default="1.0.0", server_default="1.0.0"
    )


class LibrarySkill(Base, SoftDeleteAuditMixin):
    """Reusable skill definition (``library_skills`` table)."""

    __tablename__ = "library_skills"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    published_by: Mapped[str | None] = mapped_column(String, nullable=True)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    version: Mapped[str] = mapped_column(
        String, nullable=False, default="1.0.0", server_default="1.0.0"
    )
    license: Mapped[str | None] = mapped_column(String, nullable=True)
    compatibility: Mapped[str | None] = mapped_column(String, nullable=True)
    skill_metadata: Mapped[dict[str, str] | None] = mapped_column(JSONB, nullable=True)

    files: Mapped[list[LibrarySkillFile]] = relationship(
        "LibrarySkillFile", back_populates="skill", cascade="all, delete-orphan"
    )


class LibrarySkillFile(Base, SoftDeleteAuditMixin):
    """File attached to a library skill (``library_skill_files`` table)."""

    __tablename__ = "library_skill_files"

    id: Mapped[uuid.UUID] = uuid_pk()
    skill_id: Mapped[uuid.UUID] = uuid_fk("library_skills.id", ondelete="CASCADE")
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    skill: Mapped[LibrarySkill] = relationship("LibrarySkill", back_populates="files")
