"""
src/tools
---------
Framework-agnostic tool management for TelaiOS agents.

Public API::

    from tools import ExecutableTool, ToolRegistry
    from tools import make_read_file_tool, make_write_file_tool
    from tools import make_run_shell_tool, make_finish_tool
    from tools import McpToolLoader, skill_to_executable_tool
"""

from tools.builtin import (
    make_finish_tool,
    make_read_file_tool,
    make_run_shell_tool,
    make_write_file_tool,
)
from tools.mcp import McpToolLoader
from tools.registry import ToolRegistry
from tools.skill import skill_to_executable_tool
from tools.types import ExecutableTool

__all__ = [
    "ExecutableTool",
    "McpToolLoader",
    "ToolRegistry",
    "make_finish_tool",
    "make_read_file_tool",
    "make_run_shell_tool",
    "make_write_file_tool",
    "skill_to_executable_tool",
]
