"""add_density_glass_blur_to_settings

Revision ID: a7b8c9d0e1f2
Revises: c1d2e3f4a5b6
Create Date: 2026-06-06 12:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "settings",
        sa.Column("density", sa.String(length=16), nullable=False, server_default="regular"),
    )
    op.add_column(
        "settings",
        sa.Column("glass_blur", sa.Integer(), nullable=False, server_default="28"),
    )


def downgrade() -> None:
    op.drop_column("settings", "glass_blur")
    op.drop_column("settings", "density")
