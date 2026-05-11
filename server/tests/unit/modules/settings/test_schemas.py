"""tests/unit/modules/settings/test_schemas.py

Unit tests for settings module schemas.
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
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_base_url": None,
            "llm_temperature": 0.7,
            "llm_max_tokens": 4096,
            "llm_top_p": 1.0,
            "llm_frequency_penalty": 0.0,
            "llm_presence_penalty": 0.0,
            "has_api_key": True,
            "updated_at": _now(),
        }
        read = SettingsRead.model_validate(data)
        assert read.id == 1
        assert read.llm_provider == "openai"
        assert read.has_api_key is True

    def test_all_none_optional(self):
        data = {
            "id": 1,
            "llm_provider": None,
            "llm_model": None,
            "llm_base_url": None,
            "llm_temperature": None,
            "llm_max_tokens": None,
            "llm_top_p": None,
            "llm_frequency_penalty": None,
            "llm_presence_penalty": None,
            "has_api_key": False,
            "updated_at": _now(),
        }
        read = SettingsRead.model_validate(data)
        assert read.has_api_key is False
        assert read.llm_provider is None

    def test_no_raw_api_key_field(self):
        """SettingsRead must never expose the raw llm_api_key."""
        read = SettingsRead.model_validate(
            {
                "id": 1,
                "llm_provider": None,
                "llm_model": None,
                "llm_base_url": None,
                "llm_temperature": None,
                "llm_max_tokens": None,
                "llm_top_p": None,
                "llm_frequency_penalty": None,
                "llm_presence_penalty": None,
                "has_api_key": False,
                "updated_at": _now(),
            }
        )
        assert not hasattr(read, "llm_api_key")


# ── PatchSettingsDto ──────────────────────────────────────────────────────


class TestPatchSettingsDto:
    def test_all_none_default(self):
        dto = PatchSettingsDto()
        assert dto.llm_provider is None
        assert dto.llm_api_key_raw is None
        assert dto.llm_temperature is None

    def test_valid_temperature_boundary(self):
        PatchSettingsDto(llm_temperature=0.0)
        PatchSettingsDto(llm_temperature=2.0)

    def test_temperature_above_max_raises(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(llm_temperature=2.1)

    def test_temperature_below_min_raises(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(llm_temperature=-0.1)

    def test_max_tokens_must_be_positive(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(llm_max_tokens=0)

    def test_max_tokens_valid(self):
        dto = PatchSettingsDto(llm_max_tokens=1)
        assert dto.llm_max_tokens == 1

    def test_top_p_boundary(self):
        PatchSettingsDto(llm_top_p=0.0)
        PatchSettingsDto(llm_top_p=1.0)

    def test_top_p_above_max_raises(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(llm_top_p=1.1)

    def test_frequency_penalty_boundary(self):
        PatchSettingsDto(llm_frequency_penalty=-2.0)
        PatchSettingsDto(llm_frequency_penalty=2.0)

    def test_frequency_penalty_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(llm_frequency_penalty=2.1)

    def test_presence_penalty_boundary(self):
        PatchSettingsDto(llm_presence_penalty=-2.0)
        PatchSettingsDto(llm_presence_penalty=2.0)

    def test_presence_penalty_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            PatchSettingsDto(llm_presence_penalty=-2.1)

    def test_llm_api_key_raw_passthrough(self):
        dto = PatchSettingsDto(llm_api_key_raw="sk-abc123")
        assert dto.llm_api_key_raw == "sk-abc123"
