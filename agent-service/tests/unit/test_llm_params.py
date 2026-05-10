"""Unit tests for composable system prompt helper and LLM param forwarding."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch

# ── _compose_prompt (shared across specialist agents) ─────────────────────────
from telaios.core import _build_llm_config
from telaios.core.providers.langchain.llm import build_llm


def _compose_prompt(builtin: str, custom: str | None, mode: str) -> str:
    if not custom:
        return builtin
    if mode == "extend":
        return f"{builtin}\n\n{custom}"
    return custom


class TestComposePrompt:
    def test_returns_builtin_when_no_custom(self):
        assert _compose_prompt("builtin", None, "override") == "builtin"
        assert _compose_prompt("builtin", "", "override") == "builtin"
        assert _compose_prompt("builtin", None, "extend") == "builtin"

    def test_override_replaces_builtin(self):
        result = _compose_prompt("builtin prompt", "custom prompt", "override")
        assert result == "custom prompt"

    def test_extend_appends_to_builtin(self):
        result = _compose_prompt("builtin", "extra", "extend")
        assert result == "builtin\n\nextra"

    def test_extend_preserves_builtin_when_custom_provided(self):
        result = _compose_prompt("A", "B", "extend")
        assert result.startswith("A")
        assert "B" in result

    def test_override_does_not_include_builtin(self):
        result = _compose_prompt("builtin", "custom", "override")
        assert "builtin" not in result

    def test_extend_includes_both(self):
        result = _compose_prompt("alpha", "beta", "extend")
        assert "alpha" in result
        assert "beta" in result


# ── build_chat_model LLM parameter forwarding ─────────────────────────────────
# ChatOpenAI and ChatAnthropic are lazy imports inside build_chat_model, so
# we patch them at the module level where they live.

class TestBuildChatModelParams:
    def test_openai_no_extra_params(self):
        with patch("langchain_openai.ChatOpenAI") as mock_cls:
            mock_cls.return_value = MagicMock()
            build_llm(_build_llm_config({"llm_provider": "openai", "llm_model": "gpt-4o", "llm_api_key_raw": "sk-test"}))
        call_kwargs = mock_cls.call_args.kwargs if mock_cls.called else mock_cls.call_args_list[-1].kwargs
        assert "temperature" not in call_kwargs
        assert "max_tokens" not in call_kwargs

    def _call_build(self, **kwargs):
        """Helper: call build_chat_model with ChatOpenAI mocked."""
        mock_instance = MagicMock()
        with patch("langchain_openai.ChatOpenAI", return_value=mock_instance) as mock_cls:
            settings = {"llm_provider": "openai", "llm_model": "gpt-4o", "llm_api_key_raw": "sk"}
            settings.update({f"llm_{key}": value for key, value in kwargs.items()})
            build_llm(_build_llm_config(settings))
            return mock_cls.call_args.kwargs if mock_cls.call_args else {}

    def _call_build_anthropic(self, **kwargs):
        mock_instance = MagicMock()
        with patch("langchain_anthropic.ChatAnthropic", return_value=mock_instance) as mock_cls:
            settings = {"llm_provider": "anthropic", "llm_model": "claude-3", "llm_api_key_raw": "sk"}
            settings.update({f"llm_{key}": value for key, value in kwargs.items()})
            build_llm(_build_llm_config(settings))
            return mock_cls.call_args.kwargs if mock_cls.call_args else {}

    def test_openai_temperature_forwarded(self):
        kw = self._call_build(temperature=0.3)
        assert kw.get("temperature") == 0.3

    def test_openai_max_tokens_forwarded(self):
        kw = self._call_build(max_tokens=2048)
        assert kw.get("max_tokens") == 2048

    def test_openai_top_p_forwarded(self):
        kw = self._call_build(top_p=0.9)
        assert kw.get("top_p") == 0.9

    def test_openai_frequency_penalty_forwarded(self):
        kw = self._call_build(frequency_penalty=0.5)
        assert kw.get("frequency_penalty") == 0.5

    def test_openai_presence_penalty_forwarded(self):
        kw = self._call_build(presence_penalty=-0.2)
        assert kw.get("presence_penalty") == -0.2

    def test_all_params_forwarded_together(self):
        kw = self._call_build(
            temperature=0.7,
            max_tokens=1024,
            top_p=0.95,
            frequency_penalty=0.1,
            presence_penalty=0.2,
        )
        assert kw["temperature"] == 0.7
        assert kw["max_tokens"] == 1024
        assert kw["top_p"] == 0.95
        assert kw["frequency_penalty"] == 0.1
        assert kw["presence_penalty"] == 0.2

    def test_none_params_not_forwarded(self):
        """None values must not be forwarded — let the provider use its defaults."""
        kw = self._call_build(temperature=None, max_tokens=None)
        assert "temperature" not in kw
        assert "max_tokens" not in kw

    def test_base_url_forwarded(self):
        kw = self._call_build(base_url="http://localhost:11434/v1")
        assert kw.get("base_url") == "http://localhost:11434/v1"

    def test_anthropic_temperature_forwarded(self):
        kw = self._call_build_anthropic(temperature=0.5)
        assert kw.get("temperature") == 0.5

    def test_anthropic_frequency_penalty_not_forwarded(self):
        """Anthropic model does not receive OpenAI-specific penalty params."""
        kw = self._call_build_anthropic(frequency_penalty=0.5, presence_penalty=0.5)
        assert "frequency_penalty" not in kw
        assert "presence_penalty" not in kw
