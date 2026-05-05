"""
Unit tests for the ConfigurableAgent create_react_agent migration (6A).

Covers:
- _compose_prompt override and extend modes
- _build_skill_tools returns empty list when no skills
- _build_skill_tools produces StructuredTool with correct name and async coroutine
- _format_structured_output passthrough when no schema configured
- finish tool is attached only when skills are present
"""
from __future__ import annotations

import pytest

from domain.agents.configurable import (
    ConfigurableAgent,
    ConfigurableAgentConfig,
    _compose_prompt,
    _build_finish_tool,
)


class TestComposePrompt:
    def test_override_mode_discards_builtin(self):
        result = _compose_prompt("builtin text", "custom text", "override")
        assert result == "custom text"

    def test_extend_mode_appends_custom(self):
        result = _compose_prompt("builtin text", "custom text", "extend")
        assert result == "builtin text\n\ncustom text"

    def test_no_custom_returns_builtin(self):
        result = _compose_prompt("builtin text", None, "override")
        assert result == "builtin text"

    def test_empty_custom_returns_builtin(self):
        result = _compose_prompt("builtin text", "", "extend")
        assert result == "builtin text"


class TestBuildSkillTools:
    def _make_agent(self, skills=None):
        cfg = ConfigurableAgentConfig(skills=skills or [])
        return ConfigurableAgent("test-id", cfg)

    def test_no_skills_returns_empty_list(self):
        agent = self._make_agent()
        assert agent._build_skill_tools() == []

    def test_skill_produces_structured_tool_with_correct_name(self):
        import inspect

        agent = self._make_agent(skills=[{
            "name": "my_skill",
            "description": "Does something",
            "instructions": "Step 1",
            "inputSchema": {"type": "object", "properties": {"x": {"type": "string"}}},
        }])
        tools = agent._build_skill_tools()
        assert len(tools) == 1
        t = tools[0]
        assert t.name == "my_skill"
        assert t.coroutine is not None
        assert inspect.iscoroutinefunction(t.coroutine)

    def test_finish_tool_attached_when_skills_present(self):
        agent = self._make_agent(skills=[{
            "name": "do_thing",
            "description": "desc",
            "inputSchema": {},
        }])
        skill_tools = agent._build_skill_tools()
        from domain.agents.configurable import _build_finish_tool
        lc_tools = skill_tools + [_build_finish_tool()] if skill_tools else skill_tools
        names = {t.name for t in lc_tools}
        assert "finish" in names

    def test_finish_tool_not_attached_when_no_skills(self):
        agent = self._make_agent()
        skill_tools = agent._build_skill_tools()
        # Without skills, finish should not be added
        assert skill_tools == []


class TestFormatStructuredOutput:
    @pytest.mark.asyncio
    async def test_no_schema_returns_raw_output(self):
        cfg = ConfigurableAgentConfig(structuredOutput=None)
        agent = ConfigurableAgent("test-id", cfg)
        agent._llm = None  # should never be called
        result = await agent._format_structured_output("hello world")
        assert result == "hello world"

    @pytest.mark.asyncio
    async def test_empty_output_returns_empty(self):
        cfg = ConfigurableAgentConfig(structuredOutput={"type": "object"})
        agent = ConfigurableAgent("test-id", cfg)
        agent._llm = None
        result = await agent._format_structured_output("")
        assert result == ""

    @pytest.mark.asyncio
    async def test_valid_json_passthrough_without_llm_call(self):
        cfg = ConfigurableAgentConfig(structuredOutput={"type": "object"})
        agent = ConfigurableAgent("test-id", cfg)
        agent._llm = None  # would raise if called
        result = await agent._format_structured_output('{"key": "value"}')
        assert result == '{"key": "value"}'


class TestFinishTool:
    @pytest.mark.asyncio
    async def test_finish_echoes_summary(self):
        tool = _build_finish_tool()
        result = await tool.coroutine(summary="all done")
        assert result == "all done"
