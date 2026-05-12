"""Settings schemas.

UI customisation settings (brand name, colour, logo, favicon, default theme).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    brand_name: str
    brand_color: str
    logo_url: str | None
    favicon_url: str | None
    default_theme: str
    updated_at: datetime


class PatchSettingsDto(BaseModel):
    brand_name: str | None = Field(default=None, min_length=1, max_length=255)
    brand_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    logo_url: str | None = Field(default=None, max_length=500_000)  # base64
    favicon_url: str | None = Field(default=None, max_length=100_000)  # base64
    default_theme: str | None = Field(default=None, pattern=r"^(light|dark)$")


__all__ = ["PatchSettingsDto", "SettingsRead"]
