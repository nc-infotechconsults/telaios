"""tests/tools/test_registry.py — ToolRegistry behaviour."""

from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.types import McpServer, Skill, ToolAnnotations, ToolInputSchema, ToolParameter
from tools.registry import ToolRegistry
from tools.types import ExecutableTool


def _make_tool(name: str = "test_tool") -> ExecutableTool:
    async def _fn(**kwargs):
        return "result"

    return ExecutableTool(
        name=name,
        description=f"Tool {name}",
        input_schema=ToolInputSchema(properties={}),
        coroutine=_fn,
    )


class TestToolRegistryBasic:
    def test_empty_registry(self):
        reg = ToolRegistry()
        assert len(reg) == 0
        assert reg.all() == []

    def test_register_and_get(self):
        reg = ToolRegistry()
        tool = _make_tool("alpha")
        reg.register(tool)
        assert reg.get("alpha") is tool

    def test_contains(self):
        reg = ToolRegistry()
        reg.register(_make_tool("beta"))
        assert "beta" in reg
        assert "gamma" not in reg

    def test_get_missing_raises(self):
        reg = ToolRegistry()
        with pytest.raises(KeyError):
            reg.get("nonexistent")

    def test_register_overwrites(self):
        reg = ToolRegistry()
        t1 = _make_tool("x")
        t2 = _make_tool("x")
        reg.register(t1)
        reg.register(t2)
        assert reg.get("x") is t2

    def test_all_returns_list(self):
        reg = ToolRegistry()
        reg.register(_make_tool("a"))
        reg.register(_make_tool("b"))
        names = {t.name for t in reg.all()}
        assert names == {"a", "b"}


class TestToolRegistryFactory:
    def test_register_factory(self):
        reg = ToolRegistry()
        factory_called_with = []

        def my_factory(path: str) -> ExecutableTool:
            factory_called_with.append(path)
            return _make_tool("from_factory")

        reg.register_factory("from_factory", my_factory)
        assert "from_factory" in reg
        assert len(reg) == 1

    def test_factory_materialised_on_get(self):
        reg = ToolRegistry(workspace_path="/tmp/ws")

        def my_factory(path: str) -> ExecutableTool:
            t = _make_tool("lazy")
            return t

        reg.register_factory("lazy", my_factory)
        tool = reg.get("lazy")
        assert tool.name == "lazy"
        # factory is consumed — now stored as a concrete tool
        assert "lazy" in reg._tools

    def test_factory_without_workspace_raises(self):
        reg = ToolRegistry()
        reg.register_factory("ws_tool", lambda p: _make_tool("ws_tool"))
        with pytest.raises(KeyError, match="workspace_path"):
            reg.get("ws_tool")

    def test_factory_workspace_override(self):
        reg = ToolRegistry()
        received = []

        def factory(path: str) -> ExecutableTool:
            received.append(path)
            return _make_tool("t")

        reg.register_factory("t", factory)
        reg.get("t", workspace_path="/override")
        assert received == ["/override"]


class TestBuiltinFactories:
    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.reg = ToolRegistry(workspace_path=self.tmpdir)

    def test_builtin_tool_names_present(self):
        for name in ("read_file", "write_file", "run_shell", "finish"):
            assert name in self.reg

    def test_read_file_materialises(self):
        tool = self.reg.get("read_file")
        assert tool.name == "read_file"

    def test_write_file_materialises(self):
        tool = self.reg.get("write_file")
        assert tool.name == "write_file"

    def test_all_materialises_factories(self):
        tools = self.reg.all()
        names = {t.name for t in tools}
        assert {"read_file", "write_file", "run_shell", "finish"}.issubset(names)


class TestLoadSkill:
    def test_load_skill_registers_tool(self):
        reg = ToolRegistry()
        skill = Skill(
            name="my_skill",
            description="Does stuff",
            inputSchema=ToolInputSchema(properties={}),
            instructions="Do it.",
        )
        reg.load_skill(skill)
        assert "my_skill" in reg

    async def test_loaded_skill_coroutine_returns_instructions(self):
        reg = ToolRegistry()
        skill = Skill(
            name="sk",
            description="x",
            inputSchema=ToolInputSchema(properties={}),
            instructions="Instruction text",
        )
        reg.load_skill(skill)
        tool = reg.get("sk")
        assert await tool.coroutine() == "Instruction text"


class TestLoadMcp:
    async def test_load_mcp_registers_tools(self):
        server = McpServer(
            name="test_server",
            transport="stdio",
            command="python",
            args=["-m", "fake_mcp"],
        )
        fake_tool = _make_tool("mcp_tool")

        with patch("tools.registry.McpToolLoader") as MockLoader:
            instance = MockLoader.return_value
            instance.load = AsyncMock(return_value=[fake_tool])

            reg = ToolRegistry()
            await reg.load_mcp(server)

            assert "mcp_tool" in reg
            MockLoader.assert_called_once()
            instance.load.assert_awaited_once_with(server)
