from __future__ import annotations

import asyncio
import os
from typing import Dict, List

from langchain_core.tools import StructuredTool
from pydantic import BaseModel


def build_builtin_tools(workspaces: Dict[str, str]) -> List[StructuredTool]:
    """Build the four built-in coding tools scoped to the given workspaces."""
    primary_workspace = next(iter(workspaces.values()), "/tmp")
    safe_root = os.path.realpath(primary_workspace)

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

    class WriteFileInput(BaseModel):
        path: str
        content: str

    class ReadFileInput(BaseModel):
        path: str

    class FinishInput(BaseModel):
        summary: str

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
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
        except asyncio.TimeoutError:
            proc.kill()
            return "Command timed out after 30 seconds."
        text = f"stdout:\n{stdout.decode(errors='replace')}"
        if stderr:
            text += f"\nstderr:\n{stderr.decode(errors='replace')}"
        return text

    async def write_file(path: str, content: str) -> str:
        requested = os.path.realpath(os.path.join(primary_workspace, path))
        if not requested.startswith(safe_root + os.sep):
            return "Error: path is outside the workspace."
        os.makedirs(os.path.dirname(requested), exist_ok=True)
        with open(requested, "w", encoding="utf-8") as fh:
            fh.write(content)
        return f"File written: {path}"

    async def read_file(path: str) -> str:
        requested = os.path.realpath(os.path.join(primary_workspace, path))
        if not requested.startswith(safe_root + os.sep):
            return "Error: path is outside the workspace."
        with open(requested, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()

    async def finish(summary: str) -> str:
        return summary

    return [
        StructuredTool.from_function(
            coroutine=run_shell,
            name="run_shell",
            description="Execute a shell command in a workspace directory.",
            args_schema=RunShellInput,
        ),
        StructuredTool.from_function(
            coroutine=write_file,
            name="write_file",
            description="Write (or overwrite) a file at the given path.",
            args_schema=WriteFileInput,
        ),
        StructuredTool.from_function(
            coroutine=read_file,
            name="read_file",
            description="Read the contents of a file.",
            args_schema=ReadFileInput,
        ),
        StructuredTool.from_function(
            coroutine=finish,
            name="finish",
            description="Signal that the task is complete and provide a summary.",
            args_schema=FinishInput,
        ),
    ]
