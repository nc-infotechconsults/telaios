from __future__ import annotations

import asyncio
import os
from typing import Any


_BUILTIN_TOOLS = [
    {
        "name": "run_shell",
        "description": "Execute a shell command in a workspace directory.",
        "schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The shell command to run."},
                "cwd": {"type": "string", "description": "Working directory (absolute path or workspace name)."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "write_file",
        "description": "Write (or overwrite) a file at the given path.",
        "schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to the workspace root."},
                "content": {"type": "string", "description": "Full file content to write."},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file.",
        "schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to the workspace root."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "finish",
        "description": "Signal that the task is complete and provide a summary.",
        "schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "A concise summary of what was accomplished."},
            },
            "required": ["summary"],
        },
    },
]


async def _dispatch_tool(
    tool_name: str, args: dict, workspaces: dict[str, str]
) -> dict:
    primary_workspace = next(iter(workspaces.values()), "/tmp")

    def _resolve_cwd(cwd_arg: Any) -> str:
        if isinstance(cwd_arg, str):
            return workspaces.get(cwd_arg) or (
                cwd_arg if os.path.isabs(cwd_arg) else os.path.join(primary_workspace, cwd_arg)
            )
        return primary_workspace

    try:
        if tool_name == "run_shell":
            cwd = _resolve_cwd(args.get("cwd"))
            proc = await asyncio.create_subprocess_shell(
                args["command"],
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
            except asyncio.TimeoutError:
                proc.kill()
                return {"text": "Command timed out after 30 seconds.", "is_error": True}
            text = f"stdout:\n{stdout.decode(errors='replace')}"
            if stderr:
                text += f"\nstderr:\n{stderr.decode(errors='replace')}"
            return {"text": text, "is_error": False}

        if tool_name == "write_file":
            safe_root = os.path.realpath(primary_workspace)
            requested = os.path.realpath(os.path.join(primary_workspace, args["path"]))
            if not requested.startswith(safe_root + os.sep):
                return {"text": "Path is outside the workspace.", "is_error": True}
            os.makedirs(os.path.dirname(requested), exist_ok=True)
            with open(requested, "w", encoding="utf-8") as fh:
                fh.write(args["content"])
            return {"text": f"File written: {args['path']}", "is_error": False}

        if tool_name == "read_file":
            safe_root = os.path.realpath(primary_workspace)
            requested = os.path.realpath(os.path.join(primary_workspace, args["path"]))
            if not requested.startswith(safe_root + os.sep):
                return {"text": "Path is outside the workspace.", "is_error": True}
            with open(requested, "r", encoding="utf-8", errors="replace") as fh:
                return {"text": fh.read(), "is_error": False}

        if tool_name == "finish":
            return {"text": str(args.get("summary", "")), "is_error": False}

        return {"text": f"Unknown tool: {tool_name}", "is_error": True}
    except Exception as exc:
        return {"text": f"Tool error ({tool_name}): {exc}", "is_error": True}
