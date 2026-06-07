"""drop glass settings columns

Revision ID: 01b8056728f2
Revises: a7b8c9d0e1f2
Create Date: 2026-06-07 21:00:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "01b8056728f2"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("settings", "custom_theme")
    op.drop_column("settings", "theme_preset")
    op.drop_column("settings", "glass_blur")
    op.drop_column("settings", "density")


def downgrade() -> None:
    op.add_column(
        "settings",
        sa.Column("density", sa.String(length=16), nullable=False, server_default="regular"),
    )
    op.add_column(
        "settings",
        sa.Column("glass_blur", sa.Integer(), nullable=False, server_default="28"),
    )
    op.add_column(
        "settings",
        sa.Column("theme_preset", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "settings",
        sa.Column("custom_theme", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
