from __future__ import annotations

import json
from pathlib import Path

from tools.builtin.file_tools import make_read_file_tool, make_write_file_tool
from tools.builtin.finish_tools import make_finish_tool
from tools.builtin.shell_tools import make_run_shell_tool


async def detect_stack(workspace_path: str) -> str:
    workspace = Path(workspace_path)
    if (workspace / "package.json").exists():
        return "node"
    if (workspace / "requirements.txt").exists() or (workspace / "pyproject.toml").exists():
        return "python"
    if (workspace / "go.mod").exists():
        return "go"
    if (workspace / "Cargo.toml").exists():
        return "rust"
    return "unknown"


def build_coding_tools(ctx: dict) -> list:
    repo = ctx.get("repo") or ctx.get("workspace_path") or "."
    return [
        make_run_shell_tool(repo),
        make_read_file_tool(repo),
        make_write_file_tool(repo),
        make_finish_tool({"summary": "string"}),
    ]


def build_review_tools(ctx: dict) -> list:
    repo = ctx.get("repo") or ctx.get("workspace_path") or "."
    run_shell = make_run_shell_tool(repo, allowed_prefixes=["git", "cat", "ls", "pwd"])

    original_coroutine = run_shell.coroutine

    async def _review_shell(command: str, **kwargs) -> str:
        first = command.strip().split(maxsplit=1)[0] if command.strip() else ""
        if first not in {"git", "cat", "ls", "pwd"}:
            return "Error: command not permitted"
        return await original_coroutine(command=command, **kwargs)

    run_shell.coroutine = _review_shell
    finish = make_finish_tool({"approved": "boolean", "summary": "string", "required_changes": "array"})

    async def _finish_review(approved: bool, summary: str, required_changes: list | None = None) -> str:
        return json.dumps({
            "approved": approved,
            "summary": summary,
            "required_changes": required_changes or [],
        })

    finish.coroutine = _finish_review
    return [
        make_read_file_tool(repo),
        run_shell,
        finish,
    ]


def build_testing_tools(ctx: dict) -> list:
    repo = ctx.get("repo") or ctx.get("workspace_path") or "."
    finish = make_finish_tool({"passed": "boolean", "summary": "string", "tests_run": "integer", "failures": "array"})

    async def _finish_testing(
        passed: bool,
        summary: str,
        tests_run: int = 0,
        failures: list | None = None,
    ) -> str:
        return json.dumps({
            "passed": passed,
            "summary": summary,
            "tests_run": tests_run,
            "failures": failures or [],
        })

    finish.coroutine = _finish_testing
    return [
        make_read_file_tool(repo),
        make_write_file_tool(repo),
        make_run_shell_tool(repo),
        finish,
    ]
