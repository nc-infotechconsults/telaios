"""Global application settings singleton (``settings`` table).

Ported from ``data-api/src/entities/Settings.entity.ts``. Single-row table
holding UI customisation settings.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from telaios.db.base import Base


class AppSettings(Base):
    """Application-wide UI settings (``settings`` table, single row)."""

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1, server_default="1")

    # ── Brand identity ───────────────────────────────────────────────────────
    brand_name: Mapped[str] = mapped_column(
        String, nullable=False, default="TelaiOS", server_default="TelaiOS"
    )
    brand_color: Mapped[str] = mapped_column(
        String, nullable=False, default="#006FEE", server_default="#006FEE"
    )
    logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    favicon_url: Mapped[str | None] = mapped_column(String, nullable=True)
    default_theme: Mapped[str] = mapped_column(
        String, nullable=False, default="dark", server_default="dark"
    )

    # ── Extended theme customisation ─────────────────────────────────────────
    theme_preset: Mapped[str | None] = mapped_column(String(32), nullable=True)
    custom_theme: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
