"""SQLAlchemy declarative base and shared mixins.

All ORM models in :mod:`telaios.db.models` inherit from :class:`Base`.

Mixins:
  - :class:`TimestampMixin`  — adds ``created_at`` / ``updated_at`` columns.
  - :class:`SoftDeleteMixin` — adds nullable ``deleted_at`` column.

Helpers:
  - :func:`uuid_pk`     — UUID v4 primary-key column factory.
  - :func:`uuid_fk`     — UUID foreign-key column factory.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Project-wide declarative base.

    All models share this metadata so Alembic autogenerate sees them in one graph.
    """


def _utcnow() -> datetime:
    return datetime.now(UTC)


def uuid_pk() -> Mapped[uuid.UUID]:
    """UUID v4 primary-key column."""
    return mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )


def uuid_fk(
    target: str,
    *,
    nullable: bool = False,
    ondelete: str = "CASCADE",
    primary_key: bool = False,
    **kwargs: Any,
) -> Mapped[uuid.UUID]:
    """UUID foreign-key column targeting ``<table>.<col>`` (e.g. ``users.id``)."""
    return mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey(target, ondelete=ondelete),
        nullable=nullable,
        primary_key=primary_key,
        **kwargs,
    )


class TimestampMixin:
    """Adds DB-managed ``created_at`` and ``updated_at`` timestamps."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=_utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=_utcnow,
        onupdate=func.now(),
    )


class SoftDeleteMixin:
    """Adds a nullable ``deleted_at`` timestamp for soft deletes."""

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
