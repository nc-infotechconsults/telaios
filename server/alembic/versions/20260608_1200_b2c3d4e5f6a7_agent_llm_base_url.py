"""agent llm_base_url

Revision ID: b2c3d4e5f6a7
Revises: 01b8056728f2
Create Date: 2026-06-08 12:00:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "01b8056728f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("library_agents", sa.Column("llm_base_url", sa.String(), nullable=True))
    op.add_column("agent_overrides", sa.Column("llm_base_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_overrides", "llm_base_url")
    op.drop_column("library_agents", "llm_base_url")
