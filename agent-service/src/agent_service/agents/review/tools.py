from __future__ import annotations

import asyncio
import json
import os
from typing import Dict, List

from langchain_core.tools import StructuredTool
from pydantic import BaseModel

from agent_service.core.tools import make_read_file_tool


# Commands the reviewer is allowed to run — read-only git and file inspection.
_ALLOWED_PREFIXES = (
    "git diff",
    "git log",
    "git show",
    "git status",
    "git blame",
    "git ls-files",
    "cat ",
    "head ",
    "tail ",
    "ls ",
    "ls\n",
    "find ",
    "wc ",
    "grep ",
)


def build_review_tools(workspaces: Dict[str, str]) -> List[StructuredTool]:
    """
    Build the three read-only tools for the ReviewAgent.

    - ``read_file``  — workspace-scoped file reader (path-traversal guarded)
    - ``run_shell``  — restricted to an allow-list of read-only commands
    - ``finish``     — structured completion signal: approved / summary / required_changes
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
        approved: bool
        summary: str
        required_changes: List[str] = []

    # ── Coroutines ────────────────────────────────────────────────────────────

    async def run_shell(command: str, cwd: str = "") -> str:
        stripped = command.strip()
        if not any(stripped.startswith(prefix) for prefix in _ALLOWED_PREFIXES):
            return (
                f"Error: command not permitted for reviewer. "
                f"Allowed prefixes: {', '.join(_ALLOWED_PREFIXES)}"
            )
        resolved_cwd = _resolve_cwd(cwd)
        proc = await asyncio.create_subprocess_shell(
            command,
            cwd=resolved_cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
        except asyncio.TimeoutError:
            proc.kill()
            return "Command timed out after 30 seconds."
        text = stdout.decode(errors="replace")
        if stderr:
            text += f"\nstderr:\n{stderr.decode(errors='replace')}"
        return text

    async def finish(approved: bool, summary: str, required_changes: List[str] = []) -> str:
        return json.dumps({
            "approved": approved,
            "summary": summary,
            "required_changes": required_changes,
        })

    return [
        make_read_file_tool(primary_workspace),
        StructuredTool.from_function(
            coroutine=run_shell,
            name="run_shell",
            description=(
                "Run a read-only shell command (git diff/log/show/status/blame, "
                "cat, head, tail, ls, find, wc, grep). Write commands are not permitted."
            ),
            args_schema=RunShellInput,
        ),
        StructuredTool.from_function(
            coroutine=finish,
            name="finish",
            description=(
                "Signal that the review is complete. "
                "Set approved=true if the code meets quality standards, "
                "otherwise approved=false with required_changes listing what must be fixed."
            ),
            args_schema=FinishInput,
        ),
    ]
