"""Unit tests for design chat generation helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from telaios.config.settings import get_settings
from telaios.modules.design_chat.service import _generate_assistant_and_artifact


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestGenerateAssistantAndArtifact:
    @pytest.mark.asyncio
    async def test_structured_output_persists_llm_artifact(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("LLM_PROVIDER", "openai")
        monkeypatch.setenv("LLM_MODEL", "gpt-4o-mini")
        monkeypatch.setenv("LLM_API_KEY", "test-key")
        monkeypatch.delenv("LLM_BASE_URL", raising=False)

        response_model = {
            "assistant_message": "Generated with structured output.",
            "title": "Structured Landing",
            "description": "A structured design",
            "html": "<main><h1>Structured</h1></main>",
            "css": "main{padding:24px;}",
            "js": "",
            "rationale": "Layout optimized for clarity.",
        }

        llm = MagicMock(
            invoke_structured=AsyncMock(return_value=response_model),
            invoke=AsyncMock(),
        )
        monkeypatch.setattr("telaios.modules.design_chat.service.create_llm", lambda _cfg: llm)

        assistant_text, artifact = await _generate_assistant_and_artifact(
            prompt="Build a clean pricing page",
            revision=1,
        )

        assert assistant_text == "Generated with structured output."
        assert artifact["title"] == "Structured Landing"
        assert artifact["html_content"] == "<main><h1>Structured</h1></main>"
        assert artifact["metadata"]["source"] == "llm"
        assert artifact["metadata"]["mode"] == "structured"
        llm.invoke.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_json_fallback_when_structured_unavailable(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("LLM_PROVIDER", "openai")
        monkeypatch.setenv("LLM_MODEL", "gpt-4o-mini")
        monkeypatch.setenv("LLM_API_KEY", "test-key")
        monkeypatch.delenv("LLM_BASE_URL", raising=False)

        json_payload = (
            '{"assistant_message":"Here is revision two.",'
            '"title":"JSON Revision",'
            '"description":"From JSON",'
            '"html":"<main><h2>JSON mode</h2></main>",'
            '"css":"h2{color:#111;}",'
            '"js":"",'
            '"rationale":"Uses compact hierarchy."}'
        )
        invoke_response = MagicMock(content=json_payload)
        llm = MagicMock(
            invoke_structured=AsyncMock(side_effect=RuntimeError("no structured support")),
            invoke=AsyncMock(return_value=invoke_response),
        )
        monkeypatch.setattr("telaios.modules.design_chat.service.create_llm", lambda _cfg: llm)

        assistant_text, artifact = await _generate_assistant_and_artifact(
            prompt="Make it denser",
            revision=2,
        )

        assert assistant_text == "Here is revision two."
        assert artifact["title"] == "JSON Revision"
        assert artifact["html_content"] == "<main><h2>JSON mode</h2></main>"
        assert artifact["metadata"]["source"] == "llm"
        assert artifact["metadata"]["mode"] == "json"
        llm.invoke.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_fallback_metadata_reason_when_llm_unconfigured(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("LLM_PROVIDER", "openai")
        monkeypatch.setenv("LLM_MODEL", "gpt-4o-mini")
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        monkeypatch.delenv("LLM_BASE_URL", raising=False)

        assistant_text, artifact = await _generate_assistant_and_artifact(
            prompt="Create a dashboard",
            revision=3,
        )

        assert "I drafted a UI revision" in assistant_text
        assert artifact["metadata"]["source"] == "fallback"
        assert artifact["metadata"]["reason"] == "llm_not_configured"
