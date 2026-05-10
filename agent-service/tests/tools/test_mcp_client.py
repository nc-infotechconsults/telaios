"""tests/tools/test_mcp_client.py — McpToolLoader with mocked MCP session."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from telaios.core.types import McpServer
from telaios.tools.mcp.adapter import mcp_schema_to_input_schema
from telaios.tools.mcp.client import McpToolLoader


def _make_mcp_tool(name: str, description: str = "A tool", schema: dict | None = None):
    """Build a fake mcp.types.Tool-like object."""
    return SimpleNamespace(
        name=name,
        description=description,
        inputSchema=schema or {"type": "object", "properties": {}},
        annotations=None,
    )


def _make_call_result(text: str):
    return SimpleNamespace(
        content=[SimpleNamespace(text=text)],
        isError=False,
    )


class TestMcpSchemaAdapter:
    def test_empty_schema(self):
        result = mcp_schema_to_input_schema({})
        assert result.properties is None

    def test_string_property(self):
        schema = {"properties": {"name": {"type": "string", "description": "The name"}}}
        result = mcp_schema_to_input_schema(schema)
        assert "name" in result.properties
        assert result.properties["name"].type == "string"

    def test_required_list(self):
        schema = {"properties": {"x": {"type": "integer"}}, "required": ["x"]}
        result = mcp_schema_to_input_schema(schema)
        assert result.required == ["x"]

    def test_unknown_type_falls_back_to_string(self):
        schema = {"properties": {"x": {"type": "binary"}}}
        result = mcp_schema_to_input_schema(schema)
        assert result.properties["x"].type == "string"

    def test_nested_object(self):
        schema = {
            "properties": {
                "meta": {
                    "type": "object",
                    "properties": {"id": {"type": "integer"}},
                }
            }
        }
        result = mcp_schema_to_input_schema(schema)
        assert result.properties["meta"].type == "object"
        assert "id" in result.properties["meta"].properties


class TestMcpToolLoader:
    def _make_loader_with_mock_session(self, tools, call_result=None):
        """Return (loader, mock_session) with list_tools and call_tool patched."""
        session = AsyncMock()
        session.initialize = AsyncMock()
        list_response = SimpleNamespace(tools=tools)
        session.list_tools = AsyncMock(return_value=list_response)
        session.call_tool = AsyncMock(
            return_value=call_result or _make_call_result("tool output")
        )
        return McpToolLoader(), session

    async def test_fetch_tools_returns_executable_tools(self):
        loader = McpToolLoader()
        session = AsyncMock()
        session.list_tools = AsyncMock(
            return_value=SimpleNamespace(tools=[_make_mcp_tool("alpha")])
        )
        server = McpServer(name="s", transport="stdio", command="fake")
        tools = await loader._fetch_tools(session, server)
        assert len(tools) == 1
        assert tools[0].name == "alpha"

    async def test_selected_tools_filter(self):
        loader = McpToolLoader()
        session = AsyncMock()
        session.list_tools = AsyncMock(
            return_value=SimpleNamespace(
                tools=[_make_mcp_tool("a"), _make_mcp_tool("b"), _make_mcp_tool("c")]
            )
        )
        server = McpServer(
            name="s", transport="stdio", command="fake", selected_tools=["a", "c"]
        )
        tools = await loader._fetch_tools(session, server)
        names = [t.name for t in tools]
        assert "a" in names
        assert "c" in names
        assert "b" not in names

    async def test_no_filter_returns_all(self):
        loader = McpToolLoader()
        session = AsyncMock()
        session.list_tools = AsyncMock(
            return_value=SimpleNamespace(
                tools=[_make_mcp_tool("x"), _make_mcp_tool("y")]
            )
        )
        server = McpServer(name="s", transport="stdio", command="fake")
        tools = await loader._fetch_tools(session, server)
        assert len(tools) == 2

    async def test_wrapped_coroutine_calls_session(self):
        loader = McpToolLoader()
        session = AsyncMock()
        session.call_tool = AsyncMock(return_value=_make_call_result("hello"))
        session.list_tools = AsyncMock(
            return_value=SimpleNamespace(tools=[_make_mcp_tool("my_tool")])
        )
        server = McpServer(name="s", transport="stdio", command="fake")
        tools = await loader._fetch_tools(session, server)
        result = await tools[0].coroutine(param="value")
        assert result == "hello"
        session.call_tool.assert_awaited_once_with("my_tool", arguments={"param": "value"})

    async def test_missing_command_raises_for_stdio(self):
        loader = McpToolLoader()
        server = McpServer(name="s", transport="stdio")  # no command
        with pytest.raises(ValueError, match="command"):
            await loader.load(server)

    async def test_missing_url_raises_for_http(self):
        loader = McpToolLoader()
        server = McpServer(name="s", transport="streamable-http")  # no url
        with pytest.raises(ValueError, match="url"):
            await loader.load(server)
