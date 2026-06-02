"""project_status_active_archived_closed

Revision ID: ad54d9e31b91
Revises: 92a813acdb1e
Create Date: 2026-06-02 10:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "ad54d9e31b91"
down_revision: str | None = "92a813acdb1e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE projects SET status = 'active'")
    op.alter_column(
        "projects",
        "status",
        server_default=sa.text("'active'"),
        existing_type=sa.String(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.execute("UPDATE projects SET status = 'planning'")
    op.alter_column(
        "projects",
        "status",
        server_default=sa.text("'planning'"),
        existing_type=sa.String(),
        existing_nullable=False,
    )
