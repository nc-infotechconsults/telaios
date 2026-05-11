"""
Unit tests for infra built-in helper tools.

Covers:
- detect_stack identifies common stacks from indicator files
- detect_stack returns "unknown" for empty workspace
- make_write_file_tool / make_read_file_tool are workspace-scoped
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from telaios.tools import make_read_file_tool, make_write_file_tool
from telaios.tools.builtin.agent_tools import detect_stack


class TestDetectStack:
    @pytest.mark.asyncio
    async def test_detects_python_from_requirements(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "requirements.txt").touch()  # noqa: ASYNC240
            assert await detect_stack(tmp) == "python"

    @pytest.mark.asyncio
    async def test_detects_python_from_pyproject(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "pyproject.toml").touch()  # noqa: ASYNC240
            assert await detect_stack(tmp) == "python"

    @pytest.mark.asyncio
    async def test_detects_node_from_package_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "package.json").touch()  # noqa: ASYNC240
            assert await detect_stack(tmp) == "node"

    @pytest.mark.asyncio
    async def test_detects_go(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "go.mod").touch()  # noqa: ASYNC240
            assert await detect_stack(tmp) == "go"

    @pytest.mark.asyncio
    async def test_unknown_for_empty_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            assert await detect_stack(tmp) == "unknown"


class TestBuildWorkspaceTools:
    @pytest.mark.asyncio
    async def test_write_and_read_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            write = make_write_file_tool(tmp)
            read = make_read_file_tool(tmp)

            result = await write.coroutine(path="Dockerfile", content="FROM python:3.12")
            assert "written successfully" in result
            content = await read.coroutine(path="Dockerfile")
            assert "FROM python:3.12" in content

    @pytest.mark.asyncio
    async def test_write_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            write = make_write_file_tool(tmp)
            result = await write.coroutine(path="../../etc/crontab", content="bad")
            assert "Error" in result
