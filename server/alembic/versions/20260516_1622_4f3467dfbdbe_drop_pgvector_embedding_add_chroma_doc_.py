"""drop_pgvector_embedding_add_chroma_doc_id

Revision ID: 4f3467dfbdbe
Revises: e1f2a3b4c5d6
Create Date: 2026-05-16 16:22:37.264562+00:00

Drop the pgvector ``embedding`` column and its HNSW index from
``document_chunks``.  Add ``chroma_doc_id`` to link each row to its
embedding in the Chroma vector store.

Chroma now owns all vector storage; PostgreSQL remains a classic RDBMS.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4f3467dfbdbe'
down_revision: str | None = 'e1f2a3b4c5d6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(
        "idx_document_chunks_embedding",
        table_name="document_chunks",
        postgresql_using="hnsw",
    )
    op.drop_column("document_chunks", "embedding")
    op.add_column(
        "document_chunks",
        sa.Column("chroma_doc_id", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    """Remove chroma_doc_id; embedding column cannot be restored without pgvector."""
    op.drop_column("document_chunks", "chroma_doc_id")
