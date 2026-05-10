"""Global application settings singleton (``settings`` table).

Ported from ``data-api/src/entities/Settings.entity.ts``. Single-row table
holding default LLM configuration; legacy primary key is the integer ``id=1``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from telaios.db.base import Base


class AppSettings(Base):
    """Application-wide default settings (``settings`` table, single row)."""

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1, server_default="1")

    llm_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_api_key: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_base_url: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_top_p: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_frequency_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)
    llm_presence_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
