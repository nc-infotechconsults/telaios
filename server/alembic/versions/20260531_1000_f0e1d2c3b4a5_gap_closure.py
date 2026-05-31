"""Platform gap closure: conversation fields, design layer type, project_skills, project_mcps.

Revision ID: f0e1d2c3b4a5
Revises: b7c8d9e0f1a2
Create Date: 2026-05-31 10:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f0e1d2c3b4a5"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── messages table ────────────────────────────────────────────────────
    op.add_column("messages", sa.Column(
        "sender_type", sa.String(20), nullable=False, server_default="user"
    ))
    op.add_column("messages", sa.Column(
        "specialist", sa.String(50), nullable=True
    ))
    op.add_column("messages", sa.Column(
        "user_id",
        postgresql.UUID(as_uuid=True),
        nullable=True,
    ))
    # FK constraint added separately to avoid import issues
    op.create_foreign_key(
        "fk_messages_user_id",
        "messages", "users",
        ["user_id"], ["id"],
        ondelete="SET NULL",
    )

    # ── design_sessions table ─────────────────────────────────────────────
    op.add_column("design_sessions", sa.Column(
        "layer_type", sa.String(50), nullable=False, server_default="general"
    ))

    # ── project_skills table ──────────────────────────────────────────────
    op.create_table(
        "project_skills",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("slug", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("cloned_from_library_skill_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("library_skills.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String, nullable=True),
        sa.Column("updated_by", sa.String, nullable=True),
        sa.Column("deleted_by", sa.String, nullable=True),
    )
    op.create_index("ix_project_skills_project_id", "project_skills", ["project_id"])
    op.create_unique_constraint(
        "uq_project_skills_project_slug", "project_skills", ["project_id", "slug"]
    )

    # ── project_mcps table ────────────────────────────────────────────────
    op.create_table(
        "project_mcps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("slug", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("transport", sa.String(30), nullable=False, server_default="stdio"),
        sa.Column("command", sa.String, nullable=True),
        sa.Column("args", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("env", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("url", sa.String, nullable=True),
        sa.Column("headers", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("cloned_from_library_mcp_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("library_mcps.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String, nullable=True),
        sa.Column("updated_by", sa.String, nullable=True),
        sa.Column("deleted_by", sa.String, nullable=True),
    )
    op.create_index("ix_project_mcps_project_id", "project_mcps", ["project_id"])
    op.create_unique_constraint(
        "uq_project_mcps_project_slug", "project_mcps", ["project_id", "slug"]
    )


def downgrade() -> None:
    op.drop_table("project_mcps")
    op.drop_table("project_skills")
    op.drop_column("design_sessions", "layer_type")
    op.drop_constraint("fk_messages_user_id", "messages", type_="foreignkey")
    op.drop_column("messages", "user_id")
    op.drop_column("messages", "specialist")
    op.drop_column("messages", "sender_type")
