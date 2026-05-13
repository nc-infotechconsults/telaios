"""add_theme_preset_custom_theme

Revision ID: a2b3c4d5e6f7
Revises: 91f83ddf15d9
Create Date: 2026-05-13 00:01:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f7"
down_revision: str | Sequence[str] | None = "91f83ddf15d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "settings",
        sa.Column("theme_preset", sa.String(32), nullable=True),
    )
    op.add_column(
        "settings",
        sa.Column("custom_theme", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("settings", "custom_theme")
    op.drop_column("settings", "theme_preset")
