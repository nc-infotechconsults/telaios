"""
src/tools/builtin/file_tools.py
--------------------------------
Workspace-scoped file read / write tools.

Each factory closes over a ``workspace_path`` so the agent can only read
and write files within its designated directory.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from telaios.core.types import ToolAnnotations, ToolInputSchema, ToolParameter
from telaios.tools.types import ExecutableTool


def _resolve_path(workspace_path: str, relative_path: str) -> Path:
    """Resolve ``relative_path`` relative to ``workspace_path``.

    Raises ``ValueError`` if the resolved path escapes the workspace root
    (path traversal prevention).
    """
    workspace = Path(workspace_path).resolve()
    target = (workspace / relative_path).resolve()
    if not target.is_relative_to(workspace):
        raise ValueError(f"Path '{relative_path}' escapes the workspace root '{workspace_path}'")
    return target


def make_read_file_tool(workspace_path: str) -> ExecutableTool:
    """Return a ``read_file`` ``ExecutableTool`` scoped to *workspace_path*."""

    async def _read_file(path: str, **_: Any) -> str:
        try:
            target = _resolve_path(workspace_path, path)
        except ValueError as exc:
            return f"Error: {exc}"
        if not target.exists():
            return f"Error: file '{path}' does not exist."
        return target.read_text(encoding="utf-8", errors="replace")

    return ExecutableTool(
        name="read_file",
        description=(
            "Read the contents of a file at the given path relative to the workspace root."
        ),
        input_schema=ToolInputSchema(
            properties={
                "path": ToolParameter(
                    type="string",
                    description="File path relative to the workspace root.",
                )
            },
            required=["path"],
        ),
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_read_file,
    )


def make_write_file_tool(workspace_path: str) -> ExecutableTool:
    """Return a ``write_file`` ``ExecutableTool`` scoped to *workspace_path*."""

    async def _write_file(path: str, content: str, **_: Any) -> str:
        try:
            target = _resolve_path(workspace_path, path)
        except ValueError as exc:
            return f"Error: {exc}"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"File '{path}' written successfully ({len(content)} bytes)."

    return ExecutableTool(
        name="write_file",
        description=(
            "Write content to a file at the given path relative to the workspace root. "
            "Parent directories are created automatically."
        ),
        input_schema=ToolInputSchema(
            properties={
                "path": ToolParameter(
                    type="string",
                    description="File path relative to the workspace root.",
                ),
                "content": ToolParameter(
                    type="string",
                    description="Text content to write to the file.",
                ),
            },
            required=["path", "content"],
        ),
        annotations=ToolAnnotations(destructive=True),
        coroutine=_write_file,
    )
