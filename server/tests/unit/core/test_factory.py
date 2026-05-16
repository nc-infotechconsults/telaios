"""tests/core/test_factory.py — Tests for core.factory functions."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from telaios.core import (
    create_agent,
    create_agent_with_config,
    create_llm,
)
from telaios.core.factory import _build_llm_config
from telaios.core.types import AgentConfig, LLMConfig


class TestBuildLLMConfig:
    """Tests for the internal _build_llm_config helper."""

    def test_basic_settings(self):
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key_raw": "sk-test-123",
        }
        config = _build_llm_config(settings)
        assert config.provider == "openai"
        assert config.model == "gpt-4o"
        assert config.api_key == "sk-test-123"

    def test_overrides_take_precedence(self):
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key_raw": "sk-base",
        }
        overrides = {
            "llm_provider": "anthropic",
            "llm_model": "claude-3",
        }
        config = _build_llm_config(settings, overrides)
        assert config.provider == "anthropic"
        assert config.model == "claude-3"
        assert config.api_key == "sk-base"  # not overridden

    def test_encrypted_key_is_decrypted(self):
        from telaios.utils import encrypt

        encrypted = encrypt("sk-real-key")
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key": encrypted,
        }
        config = _build_llm_config(settings)
        assert config.api_key == "sk-real-key"

    def test_raw_key_fallback_when_no_encrypted(self):
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key_raw": "sk-fallback",
        }
        config = _build_llm_config(settings)
        assert config.api_key == "sk-fallback"

    def test_empty_key_when_nothing_provided(self):
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
        }
        config = _build_llm_config(settings)
        assert config.api_key == ""

    def test_optional_params_propagated(self):
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key_raw": "sk-test",
            "llm_base_url": "https://custom.openai.com",
            "llm_temperature": 0.5,
            "llm_max_tokens": 4096,
            "llm_top_p": 0.9,
            "llm_frequency_penalty": 0.1,
            "llm_presence_penalty": 0.2,
        }
        config = _build_llm_config(settings)
        assert config.base_url == "https://custom.openai.com"
        assert config.temperature == 0.5
        assert config.max_tokens == 4096
        assert config.top_p == 0.9
        assert config.frequency_penalty == 0.1
        assert config.presence_penalty == 0.2

    def test_override_optional_params(self):
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key_raw": "sk-test",
            "llm_temperature": 0.5,
        }
        overrides = {"llm_temperature": 0.9}
        config = _build_llm_config(settings, overrides)
        assert config.temperature == 0.9


class TestCreateLLM:
    """Tests for create_llm factory function."""

    def test_returns_llm_instance(self):
        """create_llm returns an object with invoke/astream methods."""
        config = LLMConfig(provider="openai", model="gpt-4o", api_key="sk-test")
        llm = create_llm(config)
        assert hasattr(llm, "invoke")
        assert hasattr(llm, "astream")

    def test_any_provider_returns_langchain_llm(self):
        """create_llm always returns a LangChainLLM regardless of provider name."""
        from telaios.core.llm import LangChainLLM

        config = LLMConfig(provider="ollama", model="llama3", api_key="")
        llm = create_llm(config)
        assert isinstance(llm, LangChainLLM)


class TestCreateAgent:
    """Tests for create_agent factory function."""

    def test_returns_agent_instance(self):
        """create_agent returns an object with run/astream methods."""
        pytest.importorskip("langchain_core", reason="Phase 6: langchain not installed")
        config = AgentConfig(
            llm=LLMConfig(provider="openai", model="gpt-4o", api_key="sk-test"),
        )
        agent = create_agent(config)
        assert hasattr(agent, "run")
        assert hasattr(agent, "astream")

    def test_any_framework_returns_langchain_agent(self):
        """create_agent always returns a LangChainAgent."""
        from unittest.mock import MagicMock, patch

        from telaios.core.agent import LangChainAgent

        config = AgentConfig(
            framework="langchain",
            llm=LLMConfig(provider="openai", model="gpt-4o", api_key="sk-test"),
        )
        with patch("telaios.core.agent.build_chat_model", return_value=MagicMock()):
            agent = create_agent(config)
        assert isinstance(agent, LangChainAgent)


class TestCreateAgentWithConfig:
    """Tests for create_agent_with_config convenience function."""

    @patch("telaios.core.factory.create_agent")
    def test_returns_config_and_agent(self, mock_create_agent):
        """Returns (AgentConfig, Agent) tuple."""
        mock_create_agent.return_value = object()
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key_raw": "sk-test",
        }
        config, _ = create_agent_with_config(settings)
        assert isinstance(config, AgentConfig)
        assert config.llm.provider == "openai"
        assert config.llm.api_key == "sk-test"
        mock_create_agent.assert_called_once()

    @patch("telaios.core.factory.create_agent")
    def test_with_agent_overrides(self, mock_create_agent):
        """Agent overrides take precedence over base settings."""
        mock_create_agent.return_value = object()
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key_raw": "sk-base",
        }
        overrides = {
            "llm_provider": "anthropic",
            "llm_model": "claude-3",
            "llm_api_key_raw": "sk-override",
        }
        config, _ = create_agent_with_config(settings, overrides)
        assert config.llm.provider == "anthropic"
        assert config.llm.model == "claude-3"
        assert config.llm.api_key == "sk-override"

    @patch("telaios.core.factory.create_agent")
    def test_with_system_prompt(self, mock_create_agent):
        mock_create_agent.return_value = object()
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key_raw": "sk-test",
        }
        config, _ = create_agent_with_config(settings, system_prompt="You are a helpful assistant.")
        assert config.system_prompt == "You are a helpful assistant."

    @patch("telaios.core.factory.create_agent")
    def test_encrypted_key_decrypted(self, mock_create_agent):
        """Encrypted API key is transparently decrypted."""
        from telaios.utils import encrypt

        mock_create_agent.return_value = object()
        encrypted = encrypt("sk-real-secret-key")
        settings = {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_api_key": encrypted,
        }
        config, _ = create_agent_with_config(settings)
        assert config.llm.api_key == "sk-real-secret-key"
