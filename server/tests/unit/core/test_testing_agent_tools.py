"""
Unit tests for testing/tools.py — build_testing_tools (6B).

Covers:
- Correct tool names returned
- write_file / read_file roundtrip and path-traversal guard
- finish returns well-formed JSON
"""

from __future__ import annotations

import json
import tempfile

import pytest

from telaios.tools.builtin.agent_tools import build_testing_tools


class TestBuildTestingTools:
    def test_returns_four_tools_with_correct_names(self):
        tools = build_testing_tools({})
        names = {t.name for t in tools}
        assert names == {"read_file", "write_file", "run_shell", "finish"}

    def test_all_have_async_coroutines(self):
        import inspect

        for t in build_testing_tools({}):
            assert t.coroutine is not None
            assert inspect.iscoroutinefunction(t.coroutine), f"{t.name} must be async"


class TestWriteReadFile:
    @pytest.mark.asyncio
    async def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_testing_tools({"repo": tmp})
            write = next(t for t in tools if t.name == "write_file")
            read = next(t for t in tools if t.name == "read_file")
            await write.coroutine(path="tests/test_foo.py", content="# test")
            content = await read.coroutine(path="tests/test_foo.py")
            assert content == "# test"

    @pytest.mark.asyncio
    async def test_write_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_testing_tools({"repo": tmp})
            write = next(t for t in tools if t.name == "write_file")
            result = await write.coroutine(path="../../etc/cron.d/evil", content="x")
            assert "Error" in result

    @pytest.mark.asyncio
    async def test_read_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_testing_tools({"repo": tmp})
            read = next(t for t in tools if t.name == "read_file")
            result = await read.coroutine(path="../../etc/passwd")
            assert "Error" in result


class TestFinishTool:
    @pytest.mark.asyncio
    async def test_passed_result(self):
        tools = build_testing_tools({})
        finish = next(t for t in tools if t.name == "finish")
        raw = await finish.coroutine(passed=True, summary="All green", tests_run=42, failures=[])
        data = json.loads(raw)
        assert data["passed"] is True
        assert data["tests_run"] == 42
        assert data["failures"] == []

    @pytest.mark.asyncio
    async def test_failed_result_includes_failures(self):
        tools = build_testing_tools({})
        finish = next(t for t in tools if t.name == "finish")
        raw = await finish.coroutine(
            passed=False,
            summary="2 tests failed",
            tests_run=10,
            failures=["test_foo FAILED", "test_bar FAILED"],
        )
        data = json.loads(raw)
        assert data["passed"] is False
        assert len(data["failures"]) == 2

    @pytest.mark.asyncio
    async def test_defaults_when_omitted(self):
        tools = build_testing_tools({})
        finish = next(t for t in tools if t.name == "finish")
        raw = await finish.coroutine(passed=True, summary="ok")
        data = json.loads(raw)
        assert data["tests_run"] == 0
        assert data["failures"] == []
