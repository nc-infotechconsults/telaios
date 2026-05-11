"""add document_document_tags junction table

Revision ID: a1b2c3d4e5f6
Revises: f6095a920ac8
Create Date: 2026-05-11 06:00:00.000000+00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f6095a920ac8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_document_tags",
        sa.Column("document_id", sa.UUID(), nullable=False),
        sa.Column("tag_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["document_tags.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("document_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("document_document_tags")
