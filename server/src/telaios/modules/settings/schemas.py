"""Settings schemas.

UI customisation settings (brand name, colour, logo, favicon, default theme,
theme preset, and per-property custom theme overrides).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.functional_validators import field_validator

from telaios.domain.enums import ThemeFontFamily, ThemePreset, ThemeRadius, ThemeShadow

_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class CustomTheme(BaseModel):
    """Per-property overrides that layer on top of a theme preset."""

    background: str | None = None
    foreground: str | None = None
    content1: str | None = None
    content2: str | None = None
    content3: str | None = None
    divider: str | None = None
    radius: ThemeRadius | None = None
    shadow: ThemeShadow | None = None
    font_family: ThemeFontFamily | None = None
    sidebar_background: str | None = None

    @field_validator(
        "background",
        "foreground",
        "content1",
        "content2",
        "content3",
        "divider",
        "sidebar_background",
    )
    @classmethod
    def _validate_hex(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not _HEX_RE.match(value):
            raise ValueError("must be a valid 6-digit hex colour (e.g. #0d0d0d)")
        return value


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    brand_name: str
    brand_color: str
    logo_url: str | None
    favicon_url: str | None
    default_theme: str
    density: str | None = None
    glass_blur: int | None = None
    theme_preset: str | None = None
    custom_theme: dict[str, Any] | None = None
    updated_at: datetime


class PatchSettingsDto(BaseModel):
    brand_name: str | None = Field(default=None, min_length=1, max_length=255)
    brand_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    logo_url: str | None = Field(default=None, max_length=700_000)  # base64 data URL
    favicon_url: str | None = Field(default=None, max_length=150_000)  # base64 data URL
    default_theme: str | None = Field(default=None, pattern=r"^(light|dark)$")
    density: Literal["compact", "regular", "comfy"] | None = None
    glass_blur: int | None = Field(default=None, ge=0, le=60)
    theme_preset: ThemePreset | None = None
    custom_theme: CustomTheme | None = None

    @field_validator("logo_url", "favicon_url")
    @classmethod
    def _validate_image_data_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value.startswith("data:image/") and ";base64," in value:
            return value
        raise ValueError("must be a base64-encoded image data URL")


__all__ = ["CustomTheme", "PatchSettingsDto", "SettingsRead"]
