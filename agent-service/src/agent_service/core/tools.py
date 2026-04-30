"""
Shared workspace-scoped file tool factories.

Each factory closes over a single ``workspace_path`` directory and returns a
``StructuredTool`` ready to be passed to ``create_react_agent``.

Path-traversal is guarded: any path that resolves outside the workspace root
returns an error string rather than raising.
"""
from __future__ import annotations

import os

from langchain_core.tools import StructuredTool
from pydantic import BaseModel


def make_read_file_tool(workspace_path: str) -> StructuredTool:
    """Return a ``read_file`` StructuredTool scoped to *workspace_path*."""
    safe_root = os.path.realpath(workspace_path)

    class ReadFileInput(BaseModel):
        path: str

    async def read_file(path: str) -> str:
        requested = os.path.realpath(os.path.join(safe_root, path))
        if not requested.startswith(safe_root + os.sep):
            return "Error: path is outside the workspace."
        try:
            with open(requested, "r", encoding="utf-8", errors="replace") as fh:
                return fh.read()
        except FileNotFoundError:
            return f"Error: file not found: {path}"
        except Exception as exc:
            return f"Error reading file: {exc}"

    return StructuredTool.from_function(
        coroutine=read_file,
        name="read_file",
        description="Read the contents of a file in the workspace.",
        args_schema=ReadFileInput,
    )


def make_write_file_tool(workspace_path: str) -> StructuredTool:
    """Return a ``write_file`` StructuredTool scoped to *workspace_path*."""
    safe_root = os.path.realpath(workspace_path)

    class WriteFileInput(BaseModel):
        path: str
        content: str

    async def write_file(path: str, content: str) -> str:
        requested = os.path.realpath(os.path.join(safe_root, path))
        if not requested.startswith(safe_root + os.sep):
            return "Error: path is outside the workspace."
        os.makedirs(os.path.dirname(requested), exist_ok=True)
        with open(requested, "w", encoding="utf-8") as fh:
            fh.write(content)
        return f"File written: {path}"

    return StructuredTool.from_function(
        coroutine=write_file,
        name="write_file",
        description="Write (or overwrite) a file in the workspace.",
        args_schema=WriteFileInput,
    )
