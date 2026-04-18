"""Unit tests for AgentPool profile-driven config forwarding."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch

from agent_service.agents.coordinator.pool import AgentPool, AgentProfileConfig
from agent_service.core.types import McpServer, Skill


def _make_raw_profile(**overrides) -> dict:
    """Return a minimal raw profile dict suitable for AgentPool.initialize()."""
    base = {
        "id": "prof-1",
        "agent_type": "langgraph",
        "llm_provider": "openai",
        "llm_model": "gpt-4o",
        "llm_api_key": "",  # plaintext empty (decrypt("") returns "")
        "llm_base_url": None,
        "github_token": None,
        "mcp_servers": [],
        "skills": [],
        "system_prompt": None,
        "system_prompt_mode": "override",
        "llm_temperature": None,
        "llm_max_tokens": None,
        "llm_top_p": None,
        "llm_frequency_penalty": None,
        "llm_presence_penalty": None,
        "sub_agent_ids": [],
        "structured_output": None,
    }
    base.update(overrides)
    return base


class TestAgentProfileConfigDefaults:
    def test_default_fields_present(self):
        cfg = AgentProfileConfig(
            id="x",
            agent_type="langgraph",
            llm_provider="openai",
            llm_model="gpt-4o",
            llm_api_key="",
        )
        assert cfg.system_prompt is None
        assert cfg.system_prompt_mode == "override"
        assert cfg.llm_temperature is None
        assert cfg.llm_max_tokens is None
        assert cfg.llm_top_p is None
        assert cfg.llm_frequency_penalty is None
        assert cfg.llm_presence_penalty is None
        assert cfg.sub_agent_ids == []
        assert cfg.structured_output is None

    def test_custom_fields_stored(self):
        cfg = AgentProfileConfig(
            id="x",
            agent_type="langgraph",
            llm_provider="openai",
            llm_model="gpt-4o",
            llm_api_key="sk",
            system_prompt="You are custom.",
            system_prompt_mode="extend",
            llm_temperature=0.3,
            llm_max_tokens=512,
            llm_top_p=0.9,
            llm_frequency_penalty=0.1,
            llm_presence_penalty=-0.1,
            sub_agent_ids=["aaa-bbb-ccc"],
            structured_output={"type": "object", "properties": {"name": {"type": "string"}}},
        )
        assert cfg.system_prompt == "You are custom."
        assert cfg.system_prompt_mode == "extend"
        assert cfg.llm_temperature == 0.3
        assert cfg.llm_max_tokens == 512
        assert cfg.llm_top_p == 0.9
        assert cfg.llm_frequency_penalty == 0.1
        assert cfg.llm_presence_penalty == -0.1
        assert cfg.sub_agent_ids == ["aaa-bbb-ccc"]
        assert cfg.structured_output is not None
        assert cfg.structured_output["properties"]["name"]["type"] == "string"


class TestAgentPoolInitialize:
    def test_initialize_creates_langgraph_driver(self):
        pool = AgentPool()
        mock_driver = MagicMock()

        with patch("agent_service.agents.coordinator.pool.LangGraphDriver", return_value=mock_driver) as mock_cls:
            with patch("agent_service.agents.coordinator.pool.build_chat_model") as mock_llm:
                mock_llm.return_value = MagicMock()
                pool.initialize([_make_raw_profile()])

        assert pool.get_driver("prof-1") == mock_driver

    def test_initialize_passes_llm_params_to_build_chat_model(self):
        pool = AgentPool()
        with patch("agent_service.agents.coordinator.pool.LangGraphDriver") as mock_lg:
            mock_lg.return_value = MagicMock()
            with patch("agent_service.agents.coordinator.pool.build_chat_model") as mock_llm:
                mock_llm.return_value = MagicMock()
                pool.initialize([
                    _make_raw_profile(
                        llm_temperature=0.4,
                        llm_max_tokens=1024,
                        llm_top_p=0.8,
                        llm_frequency_penalty=0.2,
                        llm_presence_penalty=-0.3,
                    )
                ])

        call_kwargs = mock_llm.call_args.kwargs
        assert call_kwargs["temperature"] == 0.4
        assert call_kwargs["max_tokens"] == 1024
        assert call_kwargs["top_p"] == 0.8
        assert call_kwargs["frequency_penalty"] == 0.2
        assert call_kwargs["presence_penalty"] == -0.3

    def test_initialize_passes_system_prompt_to_langgraph_driver(self):
        pool = AgentPool()
        with patch("agent_service.agents.coordinator.pool.build_chat_model") as mock_llm:
            mock_llm.return_value = MagicMock()
            with patch("agent_service.agents.coordinator.pool.LangGraphDriver") as mock_lg:
                mock_lg.return_value = MagicMock()
                pool.initialize([
                    _make_raw_profile(
                        system_prompt="Custom coding instructions.",
                        system_prompt_mode="extend",
                    )
                ])

        call_kwargs = mock_lg.call_args.kwargs
        assert call_kwargs["system_prompt"] == "Custom coding instructions."
        assert call_kwargs["system_prompt_mode"] == "extend"

    def test_initialize_registers_driver_by_profile_id(self):
        pool = AgentPool()
        with patch("agent_service.agents.coordinator.pool.build_chat_model"):
            with patch("agent_service.agents.coordinator.pool.LangGraphDriver") as mock_lg:
                mock_lg.return_value = MagicMock()
                pool.initialize([_make_raw_profile(id="my-profile-id")])

        assert pool.get_driver("my-profile-id") is not None
        assert pool.get_driver("nonexistent") is None

    def test_initialize_multiple_profiles(self):
        pool = AgentPool()
        with patch("agent_service.agents.coordinator.pool.build_chat_model"):
            with patch("agent_service.agents.coordinator.pool.LangGraphDriver") as mock_lg:
                mock_lg.return_value = MagicMock()
                pool.initialize([
                    _make_raw_profile(id="p1"),
                    _make_raw_profile(id="p2"),
                ])

        assert pool.get_driver("p1") is not None
        assert pool.get_driver("p2") is not None


class TestAgentPoolRegisterRoleDrivers:
    def _make_project_agent(self, role: str, **profile_overrides) -> dict:
        return {
            "role": role,
            "agent_profile_id": "prof-1",
            "agent_profile": _make_raw_profile(**profile_overrides),
        }

    def test_registers_reviewer_role(self):
        from agent_service.agents.register import register_all_agents
        from agent_service.core.agent_framework.registry import AgentRegistry

        # Reset singleton
        AgentRegistry._instance = None
        register_all_agents()

        pool = AgentPool()
        with patch("agent_service.agents.review.review_agent.build_chat_model") as mock_llm:
            mock_llm.return_value = MagicMock()
            pool.register_role_drivers(
                [self._make_project_agent("reviewer")],
                {"project_id": "proj-1"},
            )

        assert pool.get_driver_by_role("reviewer") is not None

    def test_skips_unknown_roles(self):
        from agent_service.agents.register import register_all_agents
        from agent_service.core.agent_framework.registry import AgentRegistry

        AgentRegistry._instance = None
        register_all_agents()

        pool = AgentPool()
        pool.register_role_drivers(
            [{"role": "unknown-role", "agent_profile_id": "x", "agent_profile": {}}],
            {},
        )
        assert pool.get_driver_by_role("unknown-role") is None

    def test_passes_config_to_specialist_agent(self):
        from agent_service.agents.register import register_all_agents
        from agent_service.core.agent_framework.registry import AgentRegistry

        AgentRegistry._instance = None
        register_all_agents()

        pool = AgentPool()
        with patch("agent_service.agents.review.review_agent.build_chat_model") as mock_llm:
            mock_llm.return_value = MagicMock()
            pool.register_role_drivers(
                [self._make_project_agent(
                    "reviewer",
                    llm_temperature=0.1,
                    system_prompt="Focus on security.",
                    system_prompt_mode="override",
                )],
                {},
            )

        # The ReviewAgent's on_init will call build_chat_model with the config.
        # We verify the driver was registered.
        assert pool.get_driver_by_role("reviewer") is not None

    def test_registers_custom_role(self):
        from agent_service.agents.register import register_all_agents
        from agent_service.core.agent_framework.registry import AgentRegistry

        AgentRegistry._instance = None
        register_all_agents()

        pool = AgentPool()
        pool.register_role_drivers(
            [self._make_project_agent("custom")],
            {},
        )
        assert pool.get_driver_by_role("custom") is not None


class TestMcpServerSelectedTools:
    def test_selected_tools_default_none(self):
        s = McpServer(name="test", transport="stdio")
        assert s.selected_tools is None

    def test_selected_tools_set(self):
        s = McpServer(name="test", transport="stdio", selected_tools=["read_file", "write_file"])
        assert s.selected_tools == ["read_file", "write_file"]

    def test_selected_tools_empty_list(self):
        s = McpServer(name="test", transport="stdio", selected_tools=[])
        assert s.selected_tools == []


class TestStructuredOutputPoolInit:
    def test_structured_output_passed_to_langgraph_driver(self):
        pool = AgentPool()
        schema = {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
        }
        with patch("agent_service.agents.coordinator.pool.build_chat_model") as mock_llm:
            mock_llm.return_value = MagicMock()
            with patch("agent_service.agents.coordinator.pool.LangGraphDriver") as mock_lg:
                mock_lg.return_value = MagicMock()
                pool.initialize([_make_raw_profile(structured_output=schema)])

        call_kwargs = mock_lg.call_args.kwargs
        assert call_kwargs["structured_output"] == schema

    def test_structured_output_none_by_default(self):
        pool = AgentPool()
        with patch("agent_service.agents.coordinator.pool.build_chat_model") as mock_llm:
            mock_llm.return_value = MagicMock()
            with patch("agent_service.agents.coordinator.pool.LangGraphDriver") as mock_lg:
                mock_lg.return_value = MagicMock()
                pool.initialize([_make_raw_profile()])

        call_kwargs = mock_lg.call_args.kwargs
        assert call_kwargs["structured_output"] is None
