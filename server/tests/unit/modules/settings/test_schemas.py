"""tests/unit/modules/settings/test_schemas.py

Unit tests for settings module schemas (UI customisation).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from telaios.modules.settings.schemas import PatchSettingsDto, SettingsRead


def _now() -> datetime:
    return datetime.now(UTC)


# ── SettingsRead ──────────────────────────────────────────────────────────


class TestSettingsRead:
    def test_valid_full(self):
        data = {
            "id": 1,
            "brand_name": "TelaiOS",
            "brand_color": "#006FEE",
            "logo_url": "data:image/png;base64,abc",
            "favicon_url": "data:image/x-icon;base64,def",
            "default_theme": "dark",
            "updated_at": _now(),
        }
        read = SettingsRead.model_validate(data)
        assert read.id == 1
        assert read.brand_name == "TelaiOS"
        assert read.brand_color == "#006FEE"
        assert read.default_theme == "dark"

    def test_minimal(self):
        data = {
            "id": 1,
            "brand_name": "TelaiOS",
            "brand_color": "#006FEE",
            "logo_url": None,
            "favicon_url": None,
            "default_theme": "dark",
            "updated_at": _now(),
        }
        read = SettingsRead.model_validate(data)
        assert read.logo_url is None
        assert read.favicon_url is None


# ── PatchSettingsDto ──────────────────────────────────────────────────────


class TestPatchSettingsDto:
    def test_all_none_default(self):
        dto = PatchSettingsDto()
        assert dto.brand_name is None
        assert dto.brand_color is None
        assert dto.logo_url is None
        assert dto.favicon_url is None
        assert dto.default_theme is None

    def test_valid_brand_color(self):
        PatchSettingsDto(brand_color="#FF0000")
        PatchSettingsDto(brand_color="#abcdef")

    def test_invalid_brand_color_raises(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(brand_color="red")
        with pytest.raises(ValidationError):
            PatchSettingsDto(brand_color="#FF00")

    def test_valid_theme(self):
        PatchSettingsDto(default_theme="light")
        PatchSettingsDto(default_theme="dark")

    def test_invalid_theme_raises(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(default_theme="auto")

    def test_brand_name_max_length(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(brand_name="x" * 256)

    def test_brand_name_valid(self):
        dto = PatchSettingsDto(brand_name="x" * 255)
        assert dto.brand_name == "x" * 255

    def test_logo_url_allows_large_data_url(self):
        dto = PatchSettingsDto(logo_url=f"data:image/png;base64,{('a' * 600_000)}")
        assert dto.logo_url is not None

    def test_favicon_url_allows_large_data_url(self):
        dto = PatchSettingsDto(favicon_url=f"data:image/png;base64,{('a' * 120_000)}")
        assert dto.favicon_url is not None

    def test_rejects_non_data_url_logo(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(logo_url="https://example.com/logo.png")

    def test_rejects_non_data_url_favicon(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(favicon_url="/favicon.ico")
