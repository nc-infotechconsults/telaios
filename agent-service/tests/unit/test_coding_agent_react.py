"""
Unit tests for the coding agent create_react_agent migration (T1).

Covers:
- build_builtin_tools returns tools with the correct names and coroutines
- finish tool echoes its summary argument
- write_file / read_file honour workspace scoping (path-traversal blocked)
"""
from __future__ import annotations

import tempfile

import pytest

from agent_service.agents.coordinator.drivers.langgraph.tools import build_builtin_tools


class TestBuildBuiltinTools:
    def test_returns_expected_tool_names(self):
        tools = build_builtin_tools({})
        names = {t.name for t in tools}
        assert names == {"run_shell", "read_file", "write_file", "finish"}

    def test_all_are_structured_tools(self):
        from langchain_core.tools import StructuredTool

        for t in build_builtin_tools({}):
            assert isinstance(t, StructuredTool)

    def test_tools_have_async_coroutines(self):
        import inspect

        for t in build_builtin_tools({}):
            assert t.coroutine is not None and inspect.iscoroutinefunction(
                t.coroutine
            ), f"{t.name} must have an async coroutine"


class TestFinishTool:
    @pytest.mark.asyncio
    async def test_finish_echoes_summary(self):
        tools = build_builtin_tools({})
        finish = next(t for t in tools if t.name == "finish")
        result = await finish.coroutine(summary="task complete")
        assert result == "task complete"


class TestWriteReadFile:
    @pytest.mark.asyncio
    async def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_builtin_tools({"repo": tmp})
            write = next(t for t in tools if t.name == "write_file")
            read = next(t for t in tools if t.name == "read_file")

            await write.coroutine(path="hello.txt", content="world")
            content = await read.coroutine(path="hello.txt")
            assert content == "world"

    @pytest.mark.asyncio
    async def test_write_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_builtin_tools({"repo": tmp})
            write = next(t for t in tools if t.name == "write_file")
            result = await write.coroutine(path="../../etc/passwd", content="x")
            assert "Error" in result

    @pytest.mark.asyncio
    async def test_read_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_builtin_tools({"repo": tmp})
            read = next(t for t in tools if t.name == "read_file")
            result = await read.coroutine(path="../../etc/passwd")
            assert "Error" in result
