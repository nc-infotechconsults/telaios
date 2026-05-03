"""tests/tools/test_skill_adapter.py — Skill → ExecutableTool conversion."""

from __future__ import annotations

import pytest

from core.types import Skill, ToolInputSchema, ToolParameter
from tools.skill.adapter import skill_to_executable_tool


def _make_skill(**overrides) -> Skill:
    defaults = dict(
        name="my_skill",
        title="My Skill",
        description="Does something useful",
        inputSchema=ToolInputSchema(
            properties={"query": ToolParameter(type="string", description="The query")}
        ),
        instructions="Step 1: Do X\nStep 2: Do Y",
    )
    defaults.update(overrides)
    return Skill(**defaults)


class TestSkillToExecutableTool:
    def test_name_preserved(self):
        skill = _make_skill()
        tool = skill_to_executable_tool(skill)
        assert tool.name == "my_skill"

    def test_description_preserved(self):
        skill = _make_skill()
        tool = skill_to_executable_tool(skill)
        assert tool.description == "Does something useful"

    def test_input_schema_preserved(self):
        skill = _make_skill()
        tool = skill_to_executable_tool(skill)
        assert "query" in tool.input_schema.properties

    def test_output_schema_none_when_not_set(self):
        skill = _make_skill()
        tool = skill_to_executable_tool(skill)
        assert tool.output_schema is None

    async def test_coroutine_returns_instructions(self):
        skill = _make_skill()
        tool = skill_to_executable_tool(skill)
        result = await tool.coroutine(query="anything")
        assert result == "Step 1: Do X\nStep 2: Do Y"

    async def test_coroutine_ignores_kwargs(self):
        skill = _make_skill(instructions="Just do it")
        tool = skill_to_executable_tool(skill)
        result = await tool.coroutine(irrelevant="value", another=123)
        assert result == "Just do it"

    def test_read_only_annotation(self):
        skill = _make_skill()
        tool = skill_to_executable_tool(skill)
        assert tool.annotations.read_only is True
