"""Document, DocumentFolder, DocumentVersion, DocumentTemplate, DocumentChunk,
DocumentActivity, DocumentComment, DocumentTag, DocumentFavorite models.

Ported from ``data-api/src/entities/Document*.entity.ts``.

Note on circular FK between :class:`Document` and :class:`DocumentVersion`:
``Document.current_version_id`` → ``document_versions.id`` and
``DocumentVersion.document_id`` → ``documents.id``. We use ``use_alter=True``
on the former so Alembic emits a deferred ``ALTER TABLE ADD CONSTRAINT``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from telaios.db.base import Base, SoftDeleteMixin, TimestampMixin, uuid_fk, uuid_pk
from telaios.domain.enums import (
    DocumentActivityAction,
    DocumentCommentAnchorType,
    DocumentFileType,
    DocumentStatus,
)

if TYPE_CHECKING:
    from telaios.db.models.projects import Project
    from telaios.db.models.users import User

# Many-to-many junction table: Document ↔ DocumentTag
document_document_tags = Table(
    "document_document_tags",
    Base.metadata,
    Column(
        "document_id",
        PG_UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        PG_UUID(as_uuid=True),
        ForeignKey("document_tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class DocumentFolder(Base, TimestampMixin, SoftDeleteMixin):
    """Folder grouping documents (``document_folders`` table)."""

    __tablename__ = "document_folders"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")
    parent_folder_id: Mapped[uuid.UUID | None] = uuid_fk(
        "document_folders.id", nullable=True, ondelete="CASCADE"
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    created_by: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")

    project: Mapped[Project] = relationship("Project", back_populates="document_folders")
    parent_folder: Mapped[DocumentFolder | None] = relationship(
        "DocumentFolder", remote_side="DocumentFolder.id"
    )
    creator: Mapped[User | None] = relationship("User")


class Document(Base, TimestampMixin, SoftDeleteMixin):
    """A stored document (``documents`` table)."""

    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")
    folder_id: Mapped[uuid.UUID | None] = uuid_fk(
        "document_folders.id", nullable=True, ondelete="SET NULL"
    )
    # use_alter avoids the circular FK at CREATE TABLE time.
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey(
            "document_versions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_documents_current_version_id",
        ),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    file_type: Mapped[DocumentFileType] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    s3_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        String, nullable=False, default="uploading", server_default="uploading"
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    doc_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")

    project: Mapped[Project] = relationship("Project", back_populates="documents")
    folder: Mapped[DocumentFolder | None] = relationship("DocumentFolder")
    current_version: Mapped[DocumentVersion | None] = relationship(
        "DocumentVersion", foreign_keys=[current_version_id], post_update=True
    )
    uploader: Mapped[User | None] = relationship("User")
    versions: Mapped[list[DocumentVersion]] = relationship(
        "DocumentVersion",
        back_populates="document",
        foreign_keys="DocumentVersion.document_id",
        cascade="all, delete-orphan",
    )
    tags: Mapped[list[DocumentTag]] = relationship(
        "DocumentTag",
        secondary="document_document_tags",
    )


class DocumentVersion(Base):
    """Versioned copy of a document (``document_versions`` table)."""

    __tablename__ = "document_versions"

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = uuid_fk("documents.id")

    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String, nullable=False)
    change_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    document: Mapped[Document] = relationship(
        "Document", back_populates="versions", foreign_keys=[document_id]
    )
    creator: Mapped[User | None] = relationship("User")


class DocumentTemplate(Base, TimestampMixin):
    """Reusable document template (``document_templates`` table)."""

    __tablename__ = "document_templates"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_type: Mapped[DocumentFileType] = mapped_column(String, nullable=False)
    s3_key: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    is_global: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    project_id: Mapped[uuid.UUID | None] = uuid_fk("projects.id", nullable=True, ondelete="CASCADE")
    created_by: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")


class DocumentChunk(Base):
    """RAG chunk of a document (``document_chunks`` table).

    Embeddings are stored in Chroma, not PostgreSQL.  The ``chroma_doc_id``
    field links this row to its embedding in the Chroma collection.
    """

    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = uuid_fk("documents.id")

    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    chroma_doc_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    chunk_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    document: Mapped[Document] = relationship("Document")


class DocumentActivity(Base):
    """Audit-log entry for a document (``document_activities`` table)."""

    __tablename__ = "document_activities"

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = uuid_fk("documents.id")
    user_id: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")

    action: Mapped[DocumentActivityAction] = mapped_column(String, nullable=False)
    activity_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DocumentComment(Base, TimestampMixin):
    """Inline comment on a document (``document_comments`` table)."""

    __tablename__ = "document_comments"

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = uuid_fk("documents.id")
    user_id: Mapped[uuid.UUID | None] = uuid_fk("users.id", nullable=True, ondelete="SET NULL")

    content: Mapped[str] = mapped_column(Text, nullable=False)
    anchor_type: Mapped[DocumentCommentAnchorType] = mapped_column(String, nullable=False)
    anchor_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    resolved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    parent_comment_id: Mapped[uuid.UUID | None] = uuid_fk(
        "document_comments.id", nullable=True, ondelete="CASCADE"
    )

    parent_comment: Mapped[DocumentComment | None] = relationship(
        "DocumentComment", remote_side="DocumentComment.id"
    )


class DocumentTag(Base):
    """Tag scoped to a project (``document_tags`` table)."""

    __tablename__ = "document_tags"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = uuid_fk("projects.id")

    name: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(
        String, nullable=False, default="#3B82F6", server_default="#3B82F6"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DocumentFavorite(Base):
    """User favorite for a document (``document_favorites`` table). Composite PK."""

    __tablename__ = "document_favorites"

    document_id: Mapped[uuid.UUID] = uuid_fk("documents.id", primary_key=True)
    user_id: Mapped[uuid.UUID] = uuid_fk("users.id", primary_key=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
