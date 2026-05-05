"""tests/tools/test_builtin.py — built-in tool factories."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

from tools.builtin.file_tools import make_read_file_tool, make_write_file_tool
from tools.builtin.finish_tools import make_finish_tool
from tools.builtin.shell_tools import make_run_shell_tool


class TestReadFileTool:
    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.tool = make_read_file_tool(self.tmpdir)

    def test_name_and_description(self):
        assert self.tool.name == "read_file"
        assert "read" in self.tool.description.lower()

    async def test_reads_existing_file(self):
        p = Path(self.tmpdir) / "hello.txt"
        p.write_text("hello world")
        result = await self.tool.coroutine(path="hello.txt")
        assert result == "hello world"

    async def test_missing_file_returns_error(self):
        result = await self.tool.coroutine(path="missing.txt")
        assert "does not exist" in result

    async def test_path_traversal_returns_error(self):
        result = await self.tool.coroutine(path="../../etc/passwd")
        assert "Error" in result

    def test_read_only_annotation(self):
        assert self.tool.annotations.read_only is True


class TestWriteFileTool:
    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.tool = make_write_file_tool(self.tmpdir)

    def test_name(self):
        assert self.tool.name == "write_file"

    async def test_writes_new_file(self):
        result = await self.tool.coroutine(path="output.txt", content="data")
        assert "written successfully" in result
        assert (Path(self.tmpdir) / "output.txt").read_text() == "data"

    async def test_creates_parent_dirs(self):
        result = await self.tool.coroutine(path="sub/dir/file.txt", content="x")
        assert "written successfully" in result
        assert (Path(self.tmpdir) / "sub" / "dir" / "file.txt").exists()

    async def test_path_traversal_returns_error(self):
        result = await self.tool.coroutine(path="../outside.txt", content="x")
        assert "Error" in result


class TestRunShellTool:
    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.tool = make_run_shell_tool(self.tmpdir)

    def test_name(self):
        assert self.tool.name == "run_shell"

    async def test_runs_simple_command(self):
        result = await self.tool.coroutine(command="echo hello")
        assert "hello" in result

    async def test_exit_nonzero_includes_code(self):
        result = await self.tool.coroutine(command="sh -c 'exit 1'")
        assert "Exit code" in result or "1" in result

    async def test_empty_command_returns_error(self):
        result = await self.tool.coroutine(command="")
        assert "empty command" in result

    async def test_unknown_command_returns_error(self):
        result = await self.tool.coroutine(command="_no_such_cmd_xyz_")
        assert "not found" in result or "Error" in result

    async def test_allowed_prefixes_blocks_disallowed(self):
        tool = make_run_shell_tool(self.tmpdir, allowed_prefixes=["echo"])
        result = await tool.coroutine(command="ls -la")
        assert "not in the allowed list" in result

    async def test_allowed_prefixes_permits_allowed(self):
        tool = make_run_shell_tool(self.tmpdir, allowed_prefixes=["echo"])
        result = await tool.coroutine(command="echo hello")
        assert "hello" in result


class TestFinishTool:
    def test_default_schema_has_message(self):
        tool = make_finish_tool()
        assert "message" in tool.input_schema.properties

    def test_custom_fields_in_schema(self):
        tool = make_finish_tool({"summary": "string", "status": "string"})
        assert "summary" in tool.input_schema.properties
        assert "status" in tool.input_schema.properties

    async def test_coroutine_returns_key_value_pairs(self):
        tool = make_finish_tool({"summary": "string"})
        result = await tool.coroutine(summary="done")
        assert result == "done"

    async def test_empty_kwargs_returns_fallback(self):
        tool = make_finish_tool({})
        result = await tool.coroutine()
        assert result == "Task finished."
