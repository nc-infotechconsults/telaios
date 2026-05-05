"""Unit tests for ConfigurableAgent and ConfigurableAgentConfig."""
from __future__ import annotations

import pytest
from domain.agents.configurable import (
    ConfigurableAgentConfig,
    ConfigurableAgent,
    _compose_prompt,
    _DEFAULT_SYSTEM_PROMPT,
)


class TestConfigurableAgentConfig:
    def test_default_values(self):
        cfg = ConfigurableAgentConfig()
        assert cfg.llmProvider == "openai"
        assert cfg.llmModel == "gpt-4o"
        assert cfg.systemPrompt is None
        assert cfg.systemPromptMode == "override"
        assert cfg.llmTemperature is None
        assert cfg.llmMaxTokens is None
        assert cfg.mcpServers == []
        assert cfg.skills == []
        assert cfg.subAgentIds == []
        assert cfg.structuredOutput is None

    def test_custom_values_accepted(self):
        cfg = ConfigurableAgentConfig(
            systemPrompt="Do X.",
            systemPromptMode="extend",
            llmTemperature=0.5,
            llmMaxTokens=512,
            subAgentIds=["uuid-1"],
        )
        assert cfg.systemPrompt == "Do X."
        assert cfg.systemPromptMode == "extend"
        assert cfg.llmTemperature == 0.5
        assert cfg.llmMaxTokens == 512
        assert cfg.subAgentIds == ["uuid-1"]


class TestComposePrompt:
    def test_no_custom_returns_builtin(self):
        assert _compose_prompt("builtin", None, "override") == "builtin"
        assert _compose_prompt("builtin", "", "extend") == "builtin"

    def test_override_returns_custom_only(self):
        result = _compose_prompt("builtin", "custom", "override")
        assert result == "custom"
        assert "builtin" not in result

    def test_extend_appends_custom_after_builtin(self):
        result = _compose_prompt("A", "B", "extend")
        assert result == "A\n\nB"


class TestConfigurableAgentInit:
    def test_agent_type_is_custom(self):
        agent = ConfigurableAgent("agent-1", ConfigurableAgentConfig())
        assert agent.type == "custom"

    def test_agent_id_stored(self):
        agent = ConfigurableAgent("my-agent", ConfigurableAgentConfig())
        assert agent.id == "my-agent"

    def test_default_system_prompt_used_when_no_custom(self):
        """Compose with None custom should return the built-in default."""
        result = _compose_prompt(_DEFAULT_SYSTEM_PROMPT, None, "override")
        assert result == _DEFAULT_SYSTEM_PROMPT

    def test_override_replaces_default(self):
        result = _compose_prompt(_DEFAULT_SYSTEM_PROMPT, "My custom agent", "override")
        assert result == "My custom agent"

    def test_extend_appends_to_default(self):
        result = _compose_prompt(_DEFAULT_SYSTEM_PROMPT, "Extra instructions", "extend")
        assert result.startswith(_DEFAULT_SYSTEM_PROMPT)
        assert "Extra instructions" in result


class TestBuildSkillTools:
    def test_no_skills_returns_empty(self):
        agent = ConfigurableAgent("a", ConfigurableAgentConfig(skills=[]))
        assert agent._build_skill_tools() == []

    def test_skill_creates_tool_with_correct_name(self):
        cfg = ConfigurableAgentConfig(skills=[{
            "name": "run_query",
            "description": "Execute a SQL query",
            "instructions": "Use this to run SQL.",
            "inputSchema": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "SQL query"}},
                "required": ["query"],
            },
        }])
        agent = ConfigurableAgent("a", cfg)
        tools = agent._build_skill_tools()
        assert len(tools) == 1
        assert tools[0].name == "run_query"

    def test_skill_tool_description_includes_instructions(self):
        cfg = ConfigurableAgentConfig(skills=[{
            "name": "read_doc",
            "description": "Read a document",
            "instructions": "Load the file.",
            "inputSchema": {"type": "object", "properties": {}},
        }])
        agent = ConfigurableAgent("a", cfg)
        tools = agent._build_skill_tools()
        assert "Load the file." in tools[0].description

    def test_skill_with_no_input_schema_creates_tool(self):
        cfg = ConfigurableAgentConfig(skills=[{
            "name": "simple_tool",
            "description": "A simple tool",
            "instructions": "Just do it.",
        }])
        agent = ConfigurableAgent("a", cfg)
        tools = agent._build_skill_tools()
        assert len(tools) == 1

    def test_multiple_skills_create_multiple_tools(self):
        cfg = ConfigurableAgentConfig(skills=[
            {"name": "tool_a", "description": "A", "instructions": "A"},
            {"name": "tool_b", "description": "B", "instructions": "B"},
        ])
        agent = ConfigurableAgent("a", cfg)
        tools = agent._build_skill_tools()
        assert len(tools) == 2
        names = {t.name for t in tools}
        assert names == {"tool_a", "tool_b"}


class TestStructuredOutput:
    def test_config_accepts_structured_output(self):
        schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "A summary"},
                "score": {"type": "number", "description": "Score 0-100"},
            },
            "required": ["summary"],
        }
        cfg = ConfigurableAgentConfig(structuredOutput=schema)
        assert cfg.structuredOutput == schema
        assert cfg.structuredOutput["properties"]["summary"]["type"] == "string"

    def test_format_structured_output_passthrough_when_disabled(self):
        cfg = ConfigurableAgentConfig(structuredOutput=None)
        agent = ConfigurableAgent("a", cfg)
        assert agent._format_structured_output("hello world") == "hello world"

    def test_format_structured_output_passes_valid_json(self):
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
        }
        cfg = ConfigurableAgentConfig(structuredOutput=schema)
        agent = ConfigurableAgent("a", cfg)
        result = agent._format_structured_output('{"name": "test"}')
        assert result == '{"name": "test"}'

    def test_format_structured_output_empty_string(self):
        schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
        }
        cfg = ConfigurableAgentConfig(structuredOutput=schema)
        agent = ConfigurableAgent("a", cfg)
        assert agent._format_structured_output("") == ""

    def test_build_pydantic_model_from_schema(self):
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "The name"},
                "count": {"type": "integer", "description": "Count"},
            },
            "required": ["name"],
        }
        model = ConfigurableAgent._build_pydantic_model_from_schema(schema, "TestModel")
        # Verify the model has the expected fields
        assert "name" in model.model_fields
        assert "count" in model.model_fields
        # Required field
        assert model.model_fields["name"].is_required()

    def test_build_pydantic_model_empty_schema(self):
        schema = {"type": "object", "properties": {}}
        model = ConfigurableAgent._build_pydantic_model_from_schema(schema, "EmptyModel")
        assert model is not None
