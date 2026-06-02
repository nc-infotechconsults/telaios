"""Agent override models: ``AgentOverride``.

Allows workspace and project-scoped overrides of base library agent profiles.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Float, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from telaios.db.base import Base, uuid_fk, uuid_pk


class AgentOverride(Base):
    """Override configuration for a base library agent (``agent_overrides`` table).

    Workspace-scoped when project_id IS NULL; project-scoped when project_id IS NOT NULL.
    """

    __tablename__ = "agent_overrides"

    id: Mapped[uuid.UUID] = uuid_pk()
    base_profile_id: Mapped[uuid.UUID] = uuid_fk("library_agents.id", ondelete="CASCADE")
    project_id: Mapped[uuid.UUID | None] = uuid_fk(
        "projects.id", nullable=True, ondelete="CASCADE"
    )

    # Override fields — NULL means "use the layer below"
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt_mode: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_top_p: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_frequency_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_presence_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)
    mcp_servers: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    skills: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "base_profile_id",
            name="uq_agent_override_workspace_scope",
            postgresql_where=text("project_id IS NULL"),
        ),
        UniqueConstraint(
            "base_profile_id",
            "project_id",
            name="uq_agent_override_project_scope",
            postgresql_where=text("project_id IS NOT NULL"),
        ),
    )
