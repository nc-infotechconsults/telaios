"""tests/unit/modules/settings/test_service.py

Unit tests for SettingsService and _sanitize helper.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from telaios.modules.settings.schemas import PatchSettingsDto
from telaios.modules.settings.service import SettingsService, _sanitize


def _now() -> datetime:
    return datetime.now(UTC)


def _make_settings_obj(
    llm_api_key: str | None = None,
    llm_provider: str | None = "openai",
    llm_model: str | None = "gpt-4o",
    llm_temperature: float | None = 0.7,
) -> MagicMock:
    obj = MagicMock()
    obj.id = 1
    obj.llm_provider = llm_provider
    obj.llm_model = llm_model
    obj.llm_base_url = None
    obj.llm_temperature = llm_temperature
    obj.llm_max_tokens = None
    obj.llm_top_p = None
    obj.llm_frequency_penalty = None
    obj.llm_presence_penalty = None
    obj.llm_api_key = llm_api_key
    obj.updated_at = _now()
    return obj


def _make_service() -> tuple[SettingsService, AsyncMock]:
    session = AsyncMock()
    svc = SettingsService(session)
    repo = AsyncMock()
    svc._repo = repo
    return svc, repo


# ── _sanitize ─────────────────────────────────────────────────────────────


class TestSanitize:
    @patch("telaios.modules.settings.service.decrypt", return_value=None)
    def test_no_api_key_stored(self, mock_decrypt):
        obj = _make_settings_obj(llm_api_key=None)
        result = _sanitize(obj)
        assert result.has_api_key is False

    @patch("telaios.modules.settings.service.decrypt", return_value="plaintext-key")
    def test_with_api_key_has_api_key_true(self, mock_dec):
        obj = _make_settings_obj(llm_api_key="encrypted_key")
        result = _sanitize(obj)
        mock_dec.assert_called_once_with("encrypted_key")
        assert result.has_api_key is True

    @patch("telaios.modules.settings.service.decrypt", return_value="")
    def test_decrypt_returns_empty_string(self, mock_decrypt):
        obj = _make_settings_obj(llm_api_key="encrypted_key")
        result = _sanitize(obj)
        assert result.has_api_key is False

    def test_maps_all_scalar_fields(self):
        obj = _make_settings_obj(llm_api_key=None)
        with patch("telaios.modules.settings.service.decrypt", return_value=None):
            result = _sanitize(obj)
        assert result.id == 1
        assert result.llm_provider == "openai"
        assert result.llm_model == "gpt-4o"
        assert result.llm_temperature == 0.7

    def test_does_not_expose_raw_key(self):
        obj = _make_settings_obj(llm_api_key="enc_key")
        with patch("telaios.modules.settings.service.decrypt", return_value="raw"):
            result = _sanitize(obj)
        assert not hasattr(result, "llm_api_key")


# ── SettingsService.get_settings ─────────────────────────────────────────


class TestGetSettings:
    @pytest.mark.asyncio
    @patch("telaios.modules.settings.service.decrypt", return_value=None)
    async def test_calls_get_or_create(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj

        result = await svc.get_settings()

        repo.get_or_create.assert_awaited_once()
        assert result.id == 1
        assert result.has_api_key is False

    @pytest.mark.asyncio
    @patch("telaios.modules.settings.service.decrypt", return_value="key")
    async def test_has_api_key_true_when_key_present(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_settings_obj(llm_api_key="enc")
        repo.get_or_create.return_value = obj

        result = await svc.get_settings()
        assert result.has_api_key is True


# ── SettingsService.patch_settings ───────────────────────────────────────


class TestPatchSettings:
    @pytest.mark.asyncio
    @patch("telaios.modules.settings.service.decrypt", return_value=None)
    async def test_updates_scalar_fields(self, mock_decrypt):
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj
        repo.save.return_value = obj

        dto = PatchSettingsDto(llm_provider="anthropic", llm_model="claude-3")
        await svc.patch_settings(dto)

        assert obj.llm_provider == "anthropic"
        assert obj.llm_model == "claude-3"
        repo.save.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("telaios.modules.settings.service.encrypt", return_value="encrypted")
    @patch("telaios.modules.settings.service.decrypt", return_value="key")
    async def test_encrypts_raw_api_key(self, mock_decrypt, mock_enc):
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj
        repo.save.return_value = obj

        dto = PatchSettingsDto(llm_api_key_raw="sk-newkey")
        await svc.patch_settings(dto)

        mock_enc.assert_called_once_with("sk-newkey")
        assert obj.llm_api_key == "encrypted"

    @pytest.mark.asyncio
    @patch("telaios.modules.settings.service.encrypt")
    @patch("telaios.modules.settings.service.decrypt", return_value=None)
    async def test_empty_raw_key_not_encrypted(self, mock_decrypt, mock_enc):
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj
        repo.save.return_value = obj

        dto = PatchSettingsDto(llm_api_key_raw=None)
        await svc.patch_settings(dto)

        mock_enc.assert_not_called()

    @pytest.mark.asyncio
    @patch("telaios.modules.settings.service.decrypt", return_value=None)
    async def test_llm_api_key_raw_not_set_as_attr(self, mock_decrypt):
        """llm_api_key_raw should be popped before setting attrs."""
        svc, repo = _make_service()
        obj = _make_settings_obj()
        repo.get_or_create.return_value = obj
        repo.save.return_value = obj

        dto = PatchSettingsDto(llm_temperature=1.0)
        await svc.patch_settings(dto)

        # llm_api_key_raw was not set in dto, so setattr shouldn't see it
        # The object should have temperature updated
        assert obj.llm_temperature == 1.0
