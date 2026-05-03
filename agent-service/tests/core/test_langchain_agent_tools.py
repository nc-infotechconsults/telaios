"""
tests/core/test_langchain_agent_tools.py
-----------------------------------------
Verify that LangChainAgent._build_lc_tool() uses ExecutableTool.coroutine
when an ExecutableTool is supplied, and falls back to _noop for plain
ToolDefinition objects.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from core.types import ToolAnnotations, ToolDefinition, ToolInputSchema, ToolParameter
from tools.types import ExecutableTool


async def _real_impl(**kwargs) -> str:
    return "real result"


def _make_exec_tool(name: str = "real_tool") -> ExecutableTool:
    return ExecutableTool(
        name=name,
        description="A real tool",
        input_schema=ToolInputSchema(
            properties={"x": ToolParameter(type="string", description="x")},
            required=["x"],
        ),
        coroutine=_real_impl,
    )


def _make_plain_tool(name: str = "plain_tool") -> ToolDefinition:
    return ToolDefinition(
        name=name,
        description="A plain tool",
        input_schema=ToolInputSchema(
            properties={"x": ToolParameter(type="string", description="x")},
            required=["x"],
        ),
    )


def _get_agent():
    from core.providers.langchain.agent import LangChainAgent
    from core.types import AgentConfig, LLMConfig

    config = AgentConfig(
        llm=LLMConfig(provider="openai", model="gpt-4o"),
        tools=[],
    )
    with pytest.MonkeyPatch().context() as mp:
        mp.setattr(
            "core.providers.langchain.agent.build_llm",
            lambda cfg: MagicMock(),
        )
        return LangChainAgent(config)


class TestBuildLcTool:
    """Test _build_lc_tool() on LangChainAgent without full LangChain setup."""

    def test_executable_tool_uses_real_coroutine(self):
        agent = _get_agent()
        exec_tool = _make_exec_tool()
        lc_tool = agent._build_lc_tool(exec_tool)
        assert lc_tool.coroutine is _real_impl

    async def test_plain_tool_definition_uses_noop(self):
        agent = _get_agent()
        plain_tool = _make_plain_tool()
        lc_tool = agent._build_lc_tool(plain_tool)
        result = await lc_tool.coroutine(x="hi")
        assert "plain_tool" in result
        assert "invoked with" in result
