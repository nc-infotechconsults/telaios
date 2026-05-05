"""
Unit tests for review/tools.py — build_review_tools (6B).

Covers:
- Correct tool names returned
- read_file path-traversal guard
- run_shell allow-list enforcement
- finish returns well-formed JSON
"""
from __future__ import annotations

import json
import tempfile
import os

import pytest

from tools.builtin.agent_tools import build_review_tools


class TestBuildReviewTools:
    def test_returns_three_tools_with_correct_names(self):
        tools = build_review_tools({})
        names = {t.name for t in tools}
        assert names == {"read_file", "run_shell", "finish"}

    def test_all_have_async_coroutines(self):
        import inspect
        for t in build_review_tools({}):
            assert t.coroutine is not None
            assert inspect.iscoroutinefunction(t.coroutine), f"{t.name} must be async"


class TestReadFileTool:
    @pytest.mark.asyncio
    async def test_reads_existing_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "hello.txt")
            with open(path, "w") as f:
                f.write("hello reviewer")
            tools = build_review_tools({"repo": tmp})
            read = next(t for t in tools if t.name == "read_file")
            result = await read.coroutine(path="hello.txt")
            assert result == "hello reviewer"

    @pytest.mark.asyncio
    async def test_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_review_tools({"repo": tmp})
            read = next(t for t in tools if t.name == "read_file")
            result = await read.coroutine(path="../../etc/passwd")
            assert "Error" in result

    @pytest.mark.asyncio
    async def test_missing_file_returns_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_review_tools({"repo": tmp})
            read = next(t for t in tools if t.name == "read_file")
            result = await read.coroutine(path="nonexistent.py")
            assert "Error" in result


class TestRunShellTool:
    @pytest.mark.asyncio
    async def test_git_diff_is_permitted(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_review_tools({"repo": tmp})
            run = next(t for t in tools if t.name == "run_shell")
            # Command is allowed — may fail with non-zero exit but should not be rejected
            result = await run.coroutine(command="git diff HEAD", cwd="")
            assert "Error: command not permitted" not in result

    @pytest.mark.asyncio
    async def test_cat_is_permitted(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "f.txt")
            with open(path, "w") as f:
                f.write("data")
            tools = build_review_tools({"repo": tmp})
            run = next(t for t in tools if t.name == "run_shell")
            result = await run.coroutine(command="cat f.txt", cwd="")
            assert "Error: command not permitted" not in result

    @pytest.mark.asyncio
    async def test_rm_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_review_tools({"repo": tmp})
            run = next(t for t in tools if t.name == "run_shell")
            result = await run.coroutine(command="rm -rf /tmp/x", cwd="")
            assert "Error: command not permitted" in result

    @pytest.mark.asyncio
    async def test_write_command_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            tools = build_review_tools({"repo": tmp})
            run = next(t for t in tools if t.name == "run_shell")
            result = await run.coroutine(command="echo hello > file.txt", cwd="")
            assert "Error: command not permitted" in result


class TestFinishTool:
    @pytest.mark.asyncio
    async def test_approved_returns_correct_json(self):
        tools = build_review_tools({})
        finish = next(t for t in tools if t.name == "finish")
        raw = await finish.coroutine(approved=True, summary="LGTM", required_changes=[])
        data = json.loads(raw)
        assert data["approved"] is True
        assert data["summary"] == "LGTM"
        assert data["required_changes"] == []

    @pytest.mark.asyncio
    async def test_rejected_includes_changes(self):
        tools = build_review_tools({})
        finish = next(t for t in tools if t.name == "finish")
        raw = await finish.coroutine(
            approved=False,
            summary="Needs work",
            required_changes=["Add error handling", "Fix SQL injection"],
        )
        data = json.loads(raw)
        assert data["approved"] is False
        assert len(data["required_changes"]) == 2
