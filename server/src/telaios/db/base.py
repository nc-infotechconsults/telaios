"""SQLAlchemy declarative base and shared mixins.

All ORM models in :mod:`telaios.db.models` inherit from :class:`Base`.

Mixins:
  - :class:`TimestampMixin`       — adds ``created_at`` / ``updated_at`` columns.
  - :class:`SoftDeleteMixin`      — adds nullable ``deleted_at`` column.
  - :class:`AuditMixin`           — TimestampMixin + ``created_by`` / ``updated_by``.
  - :class:`SoftDeleteAuditMixin` — AuditMixin + ``deleted_at`` / ``deleted_by``.

Helpers:
  - :func:`uuid_pk`        — UUID v4 primary-key column factory.
  - :func:`uuid_fk`        — UUID foreign-key column factory.
  - :func:`set_audit_user` — set the current user-id for the request context.
  - :func:`get_audit_user` — read the current user-id from the request context.

Audit columns are auto-populated via SQLAlchemy mapper events that read a
per-request ``ContextVar``.  Set it once in HTTP middleware (see
:mod:`telaios.main`) and every INSERT / UPDATE on an audited model fills
``created_by`` / ``updated_by`` / ``deleted_by`` automatically.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, event, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, attributes, mapped_column


class Base(DeclarativeBase):
    """Project-wide declarative base.

    All models share this metadata so Alembic autogenerate sees them in one graph.
    """


# ─── Audit context ────────────────────────────────────────────────────────────

_audit_user_id: ContextVar[str | None] = ContextVar("_audit_user_id", default=None)


def set_audit_user(user_id: str | None) -> None:
    """Store the current request's user-id in the async context."""
    _audit_user_id.set(user_id)


def get_audit_user() -> str | None:
    """Return the current request's user-id, or ``None`` outside a request."""
    return _audit_user_id.get()


# ─── Helpers ─────────────────────────────────────────────────────────────────

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


# ─── Mixins ───────────────────────────────────────────────────────────────────

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


class AuditMixin(TimestampMixin):
    """TimestampMixin + ``created_by`` / ``updated_by`` populated from request context."""

    created_by: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String, nullable=True)


class SoftDeleteAuditMixin(AuditMixin):
    """AuditMixin + soft-delete columns ``deleted_at`` / ``deleted_by``."""

    deleted_by: Mapped[str | None] = mapped_column(String, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )


# ─── Event listeners ──────────────────────────────────────────────────────────

@event.listens_for(AuditMixin, "before_insert", propagate=True)
def _audit_before_insert(mapper: Any, connection: Any, target: Any) -> None:
    user_id = _audit_user_id.get()
    if not user_id:
        return
    if target.created_by is None:
        target.created_by = user_id
    target.updated_by = user_id


@event.listens_for(AuditMixin, "before_update", propagate=True)
def _audit_before_update(mapper: Any, connection: Any, target: Any) -> None:
    user_id = _audit_user_id.get()
    if user_id:
        target.updated_by = user_id


@event.listens_for(SoftDeleteAuditMixin, "before_update", propagate=True)
def _soft_delete_audit_before_update(mapper: Any, connection: Any, target: Any) -> None:
    user_id = _audit_user_id.get()
    if not user_id:
        return
    hist = attributes.get_history(target, "deleted_at")
    if not hist.added:
        return
    new_val = hist.added[0]
    old_val = hist.deleted[0] if hist.deleted else None
    if new_val is not None and old_val is None:
        # transitioning to soft-deleted: record who deleted it
        target.deleted_by = user_id
    elif new_val is None and old_val is not None:
        # restoring: clear deleted_by
        target.deleted_by = None
