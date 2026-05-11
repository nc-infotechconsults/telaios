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

from telaios.tools.builtin import (
    make_finish_tool,
    make_read_file_tool,
    make_run_shell_tool,
    make_write_file_tool,
)
from telaios.tools.builtin.documents.chunking import (
    ChunkerFactory,
    chunk_document,
    chunk_text,
)
from telaios.tools.builtin.documents.chunking_semantic import SemanticChunker
from telaios.tools.builtin.documents.chunking_structural import (
    CharacterChunker,
    HierarchicalChunker,
    PageChunker,
)
from telaios.tools.builtin.documents.conversion import (
    _markdown_to_html,
    convert_from_markdown,
    convert_to_markdown,
)
from telaios.tools.mcp import McpToolLoader
from telaios.tools.registry import ToolRegistry
from telaios.tools.skill import skill_to_executable_tool
from telaios.tools.types import ExecutableTool

__all__ = [
    "CharacterChunker",
    "ChunkerFactory",
    "ExecutableTool",
    "HierarchicalChunker",
    "McpToolLoader",
    "PageChunker",
    "SemanticChunker",
    "ToolRegistry",
    "_markdown_to_html",
    "chunk_document",
    "chunk_text",
    "convert_from_markdown",
    "convert_to_markdown",
    "make_finish_tool",
    "make_read_file_tool",
    "make_run_shell_tool",
    "make_write_file_tool",
    "skill_to_executable_tool",
]
