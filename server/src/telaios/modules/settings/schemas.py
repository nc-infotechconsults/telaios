"""Settings schemas.

UI customisation settings: brand identity (name, colour, logo, favicon)
and theme polarity (light/dark). Slice 3 of the HeroUI v3 migration
dropped the glass-specific knobs (density, glass_blur, theme_preset,
custom_theme).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.functional_validators import field_validator


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
    logo_url: str | None = Field(default=None, max_length=700_000)  # base64 data URL
    favicon_url: str | None = Field(default=None, max_length=150_000)  # base64 data URL
    default_theme: str | None = Field(default=None, pattern=r"^(light|dark)$")

    @field_validator("logo_url", "favicon_url")
    @classmethod
    def _validate_image_data_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value.startswith("data:image/") and ";base64," in value:
            return value
        raise ValueError("must be a base64-encoded image data URL")


__all__ = ["PatchSettingsDto", "SettingsRead"]
