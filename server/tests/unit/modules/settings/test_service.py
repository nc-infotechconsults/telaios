"""tests/unit/modules/settings/test_service.py

Unit tests for SettingsService (UI customisation).
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.modules.settings.schemas import PatchSettingsDto
from telaios.modules.settings.service import SettingsService


def _now() -> datetime:
    return datetime.now(UTC)


def _make_settings_obj(
    brand_name: str = "TelaiOS",
    brand_color: str = "#006FEE",
    logo_url: str | None = None,
    favicon_url: str | None = None,
    default_theme: str = "dark",
    theme_preset: str | None = None,
    custom_theme: dict | None = None,
) -> MagicMock:
    obj = MagicMock()
    obj.id = 1
    obj.brand_name = brand_name
    obj.brand_color = brand_color
    obj.logo_url = logo_url
    obj.favicon_url = favicon_url
    obj.default_theme = default_theme
    obj.theme_preset = theme_preset
    obj.custom_theme = custom_theme
    obj.updated_at = _now()
    return obj


def _make_service() -> tuple[SettingsService, AsyncMock]:
    session = AsyncMock()
    svc = SettingsService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ── SettingsService.get_settings ─────────────────────────────────────────


class TestGetSettings:
    @pytest.mark.asyncio
    async def test_calls_get_or_create(self):
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj

        result = await svc.get_settings()

        repo.get_or_create.assert_awaited_once()
        assert result.id == 1
        assert result.brand_name == "TelaiOS"
        assert result.brand_color == "#006FEE"


# ── SettingsService.patch_settings ───────────────────────────────────────


class TestPatchSettings:
    @pytest.mark.asyncio
    async def test_updates_brand_fields(self):
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj
        repo.save.return_value = obj

        dto = PatchSettingsDto(brand_name="Acme", brand_color="#FF0000")
        await svc.patch_settings(dto)

        assert obj.brand_name == "Acme"
        assert obj.brand_color == "#FF0000"
        repo.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_updates_logo_and_favicon(self):
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj
        repo.save.return_value = obj

        dto = PatchSettingsDto(
            logo_url="data:image/png;base64,abc", favicon_url="data:image/x-icon;base64,def"
        )
        await svc.patch_settings(dto)

        assert obj.logo_url == "data:image/png;base64,abc"
        assert obj.favicon_url == "data:image/x-icon;base64,def"

    @pytest.mark.asyncio
    async def test_updates_theme(self):
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj
        repo.save.return_value = obj

        dto = PatchSettingsDto(default_theme="light")
        await svc.patch_settings(dto)

        assert obj.default_theme == "light"
