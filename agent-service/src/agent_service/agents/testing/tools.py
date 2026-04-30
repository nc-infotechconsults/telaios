from __future__ import annotations

import asyncio
import json
import os
from typing import Dict, List

from langchain_core.tools import StructuredTool
from pydantic import BaseModel

from agent_service.core.tools import make_read_file_tool, make_write_file_tool


def build_testing_tools(workspaces: Dict[str, str]) -> List[StructuredTool]:
    """
    Build the four tools for the TestingAgent.

    - ``read_file``  — workspace-scoped file reader
    - ``write_file`` — workspace-scoped file writer (creates test files)
    - ``run_shell``  — unrestricted shell (run test suites, install deps, make HTTP calls)
    - ``finish``     — structured completion signal: passed / summary / tests_run / failures
    """
    primary_workspace = next(iter(workspaces.values()), "/tmp")

    def _resolve_cwd(cwd_arg: object) -> str:
        if isinstance(cwd_arg, str) and cwd_arg:
            return workspaces.get(cwd_arg) or (
                cwd_arg if os.path.isabs(cwd_arg) else os.path.join(primary_workspace, cwd_arg)
            )
        return primary_workspace

    # ── Input schemas ─────────────────────────────────────────────────────────

    class RunShellInput(BaseModel):
        command: str
        cwd: str = ""

    class FinishInput(BaseModel):
        passed: bool
        summary: str
        tests_run: int = 0
        failures: List[str] = []

    # ── Coroutines ────────────────────────────────────────────────────────────

    async def run_shell(command: str, cwd: str = "") -> str:
        resolved_cwd = _resolve_cwd(cwd)
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=resolved_cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)
        except asyncio.TimeoutError:
            proc.kill()
            return "Command timed out after 120 seconds."
        text = f"stdout:\n{stdout.decode(errors='replace')}"
        if stderr:
            text += f"\nstderr:\n{stderr.decode(errors='replace')}"
        return text

    async def finish(passed: bool, summary: str, tests_run: int = 0, failures: List[str] = []) -> str:
        return json.dumps({
            "passed": passed,
            "summary": summary,
            "tests_run": tests_run,
            "failures": failures,
        })

    return [
        make_read_file_tool(primary_workspace),
        make_write_file_tool(primary_workspace),
        StructuredTool.from_function(
            coroutine=run_shell,
            name="run_shell",
            description=(
                "Execute a shell command in a workspace directory. "
                "Use this to detect the test framework (read package.json / pyproject.toml / go.mod), "
                "run test suites (pytest, jest, go test, etc.), install dependencies, "
                "or make HTTP requests with curl."
            ),
            args_schema=RunShellInput,
        ),
        StructuredTool.from_function(
            coroutine=finish,
            name="finish",
            description=(
                "Signal that testing is complete. "
                "Set passed=true if all tests pass, false otherwise. "
                "Include tests_run count and a list of failure messages if any."
            ),
            args_schema=FinishInput,
        ),
    ]
