"""
src/tools/builtin/shell_tools.py
---------------------------------
Workspace-scoped shell execution tool.

The tool runs commands in a subprocess restricted to the workspace directory.
An optional ``allowed_prefixes`` list acts as a command allow-list; if provided
only commands whose first word matches one of the prefixes are executed.
"""

from __future__ import annotations

import asyncio
import shlex
from pathlib import Path
from typing import Any

from core.types import ToolAnnotations, ToolInputSchema, ToolParameter
from tools.types import ExecutableTool

_DEFAULT_TIMEOUT = 30


def make_run_shell_tool(
    workspace_path: str,
    allowed_prefixes: list[str] | None = None,
    timeout: int = _DEFAULT_TIMEOUT,
) -> ExecutableTool:
    """Return a ``run_shell`` ``ExecutableTool`` scoped to *workspace_path*.

    Args:
        workspace_path:   Absolute path to the workspace root; the subprocess
                          cwd is set to this directory.
        allowed_prefixes: Optional list of allowed command prefixes (first
                          token of the command string).  If ``None`` no
                          allow-list is applied.
        timeout:          Maximum execution time in seconds (default: 30).
    """

    async def _run_shell(command: str, **_: Any) -> str:
        tokens = shlex.split(command)
        if not tokens:
            return "Error: empty command."

        if allowed_prefixes is not None and tokens[0] not in allowed_prefixes:
            return (
                f"Error: command '{tokens[0]}' is not in the allowed list: "
                f"{allowed_prefixes}"
            )

        workspace = Path(workspace_path).resolve()
        try:
            proc = await asyncio.create_subprocess_exec(
                *tokens,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(workspace),
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except TimeoutError:
                proc.kill()
                await proc.communicate()
                return f"Error: command timed out after {timeout}s."
        except FileNotFoundError:
            return f"Error: command '{tokens[0]}' not found."
        except OSError as exc:
            return f"Error: {exc}"

        output = stdout.decode("utf-8", errors="replace")
        exit_code = proc.returncode
        if exit_code != 0:
            return f"Exit code {exit_code}:\n{output}"
        return output or "(no output)"

    description = "Run a shell command inside the workspace directory and return its output."
    if allowed_prefixes is not None:
        description += f" Allowed commands: {', '.join(allowed_prefixes)}."

    return ExecutableTool(
        name="run_shell",
        description=description,
        input_schema=ToolInputSchema(
            properties={
                "command": ToolParameter(
                    type="string",
                    description="Shell command to execute (e.g. 'ls -la', 'pytest tests/').",
                )
            },
            required=["command"],
        ),
        annotations=ToolAnnotations(destructive=True),
        coroutine=_run_shell,
    )
