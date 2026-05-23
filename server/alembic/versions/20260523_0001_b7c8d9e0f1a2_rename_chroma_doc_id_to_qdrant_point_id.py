"""rename_chroma_doc_id_to_qdrant_point_id

Revision ID: b7c8d9e0f1a2
Revises: 4f3467dfbdbe
Create Date: 2026-05-23 00:01:00.000000+00:00

Rename ``document_chunks.chroma_doc_id`` → ``qdrant_point_id``.
Chroma replaced by Qdrant as the vector store; PostgreSQL remains RDBMS-only.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: str | None = '4f3467dfbdbe'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "document_chunks",
        "chroma_doc_id",
        new_column_name="qdrant_point_id",
    )


def downgrade() -> None:
    op.alter_column(
        "document_chunks",
        "qdrant_point_id",
        new_column_name="chroma_doc_id",
    )
