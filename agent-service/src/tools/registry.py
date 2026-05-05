"""
src/tools/registry.py
----------------------
Per-execution ``ToolRegistry``.

A ``ToolRegistry`` collects ``ExecutableTool`` objects for a single agent
execution run.  It is **not** a global singleton — create a new instance per
run so tools can be scoped to a specific workspace path, session, etc.

Typical usage::

    registry = ToolRegistry(workspace_path="/tmp/workspace")
    registry.register(my_tool)
    await registry.load_mcp(mcp_server_config)
    registry.load_skill(skill)
    tools = registry.all()          # [ExecutableTool, ...]
    tool  = registry.get("finish")  # ExecutableTool
"""

from __future__ import annotations

import logging
from typing import Callable

from core.types import McpServer, Skill
from tools.builtin import (
    make_finish_tool,
    make_read_file_tool,
    make_run_shell_tool,
    make_write_file_tool,
)
from tools.mcp.client import McpToolLoader
from tools.skill.adapter import skill_to_executable_tool
from tools.types import ExecutableTool

logger = logging.getLogger(__name__)

# Factory type: workspace_path → ExecutableTool
_ToolFactory = Callable[[str], ExecutableTool]


class ToolRegistry:
    """Per-execution registry of ``ExecutableTool`` objects.

    Args:
        workspace_path: Optional path to the workspace root.  When supplied
                        the built-in workspace tools (``read_file``,
                        ``write_file``, ``run_shell``, ``finish``) are
                        pre-registered as factories so they materialise with
                        the correct workspace on first access.
    """

    def __init__(self, workspace_path: str | None = None) -> None:
        self._tools: dict[str, ExecutableTool] = {}
        self._factories: dict[str, _ToolFactory] = {}
        self._workspace_path = workspace_path

        if workspace_path is not None:
            self._register_builtin_factories()

    # ── Registration ───────────────────────────────────────────────────────

    def register(self, tool: ExecutableTool) -> None:
        """Register a fully-constructed ``ExecutableTool`` by its name.

        Overwrites any previously registered tool or factory with the same name.
        """
        self._tools[tool.name] = tool
        self._factories.pop(tool.name, None)
        logger.debug("ToolRegistry: registered tool '%s'", tool.name)

    def register_factory(self, name: str, factory: _ToolFactory) -> None:
        """Register a lazy factory for a workspace-scoped tool.

        The factory is called with ``workspace_path`` the first time the tool
        is accessed via ``get()`` or ``all()``.

        Args:
            name:    The tool name (used as the registry key).
            factory: Callable ``(workspace_path: str) → ExecutableTool``.
        """
        self._factories[name] = factory
        self._tools.pop(name, None)
        logger.debug("ToolRegistry: registered factory for '%s'", name)

    # ── Retrieval ──────────────────────────────────────────────────────────

    def get(
        self,
        name: str,
        workspace_path: str | None = None,
    ) -> ExecutableTool:
        """Return the named tool, materialising its factory if needed.

        Args:
            name:           Tool name to look up.
            workspace_path: Override the registry's default workspace path
                            when materialising a factory.

        Raises:
            KeyError: If no tool or factory is registered under *name*.
        """
        if name in self._tools:
            return self._tools[name]

        if name in self._factories:
            path = workspace_path or self._workspace_path
            if path is None:
                raise KeyError(
                    f"Tool '{name}' requires a workspace_path but none was provided."
                )
            tool = self._factories[name](path)
            self._tools[name] = tool
            del self._factories[name]
            return tool

        raise KeyError(f"No tool or factory registered under '{name}'.")

    def all(self, workspace_path: str | None = None) -> list[ExecutableTool]:
        """Return all registered tools, materialising outstanding factories.

        Args:
            workspace_path: Override the registry's default workspace path.

        Returns:
            Flat list of all ``ExecutableTool`` objects.
        """
        path = workspace_path or self._workspace_path
        for name in list(self._factories):
            if path is not None:
                tool = self._factories.pop(name)(path)
                self._tools[name] = tool
            else:
                logger.warning(
                    "ToolRegistry: factory '%s' skipped — no workspace_path available.",
                    name,
                )
        return list(self._tools.values())

    def list_tools(self, workspace_path: str | None = None) -> list[ExecutableTool]:
        """Compatibility alias for callers expecting a list_tools method."""
        return self.all(workspace_path)

    # ── MCP / Skill loading ────────────────────────────────────────────────

    async def load_mcp(self, server: McpServer) -> None:
        """Load tools from an MCP server and register them.

        Connects to the server, fetches its tool list (applying
        ``server.selected_tools`` if set), and registers each tool.

        Args:
            server: MCP server configuration.
        """
        loader = McpToolLoader()
        tools = await loader.load(server)
        for tool in tools:
            self.register(tool)
        logger.debug(
            "ToolRegistry: loaded %d tools from MCP server '%s'",
            len(tools),
            server.name,
        )

    def load_skill(self, skill: Skill) -> None:
        """Convert *skill* to an ``ExecutableTool`` and register it.

        Args:
            skill: The ``Skill`` to register.
        """
        tool = skill_to_executable_tool(skill)
        self.register(tool)
        logger.debug("ToolRegistry: registered skill '%s' as tool", skill.name)

    def load_skills_from_directory(self, path: str) -> int:
        """
        Load and register all skills from a directory.

        Scans the directory for skill subdirectories, parses and validates
        each SKILL.md, and registers valid skills as ExecutableTools.

        Args:
            path: Directory containing skill subdirectories.

        Returns:
            Number of skills successfully loaded.
        """
        from tools.skill.loader import SkillDirectoryScanner
        from tools.skill.validator import validate_skill_manifest
        from tools.skill.adapter import manifest_to_executable_tool

        manifests = SkillDirectoryScanner.scan(path)
        loaded = 0

        for manifest in manifests:
            validation = validate_skill_manifest(manifest)
            if validation.is_valid:
                tool = manifest_to_executable_tool(manifest)
                self.register(tool)
                loaded += 1
                logger.debug("ToolRegistry: loaded skill '%s' from %s", manifest.name, path)
            else:
                logger.warning(
                    "ToolRegistry: skill '%s' validation failed: %s",
                    manifest.name,
                    validation.errors,
                )

        logger.info("ToolRegistry: loaded %d/%d skills from %s", loaded, len(manifests), path)
        return loaded

    def load_skill_by_name(self, skills_dir: str, name: str) -> bool:
        """
        Load and register a single skill by name from a directory.

        Args:
            skills_dir: Directory containing skill subdirectories.
            name: Skill name (kebab-case).

        Returns:
            True if the skill was found and registered, False otherwise.
        """
        from tools.skill.loader import SkillDirectoryScanner
        from tools.skill.validator import validate_skill_manifest
        from tools.skill.adapter import manifest_to_executable_tool

        manifests = SkillDirectoryScanner.scan(skills_dir)

        for manifest in manifests:
            if manifest.name == name:
                validation = validate_skill_manifest(manifest)
                if validation.is_valid:
                    tool = manifest_to_executable_tool(manifest)
                    self.register(tool)
                    logger.debug("ToolRegistry: loaded skill '%s' from %s", name, skills_dir)
                    return True
                else:
                    logger.warning(
                        "ToolRegistry: skill '%s' validation failed: %s",
                        name,
                        validation.errors,
                    )
                    return False

        logger.warning("ToolRegistry: skill '%s' not found in %s", name, skills_dir)
        return False

    # ── Internals ──────────────────────────────────────────────────────────

    def _register_builtin_factories(self) -> None:
        """Pre-register workspace-scoped built-in tool factories."""
        self.register_factory("read_file", make_read_file_tool)
        self.register_factory("write_file", make_write_file_tool)
        self.register_factory("run_shell", make_run_shell_tool)
        self.register_factory("finish", lambda _: make_finish_tool())

    def __len__(self) -> int:
        return len(self._tools) + len(self._factories)

    def __contains__(self, name: object) -> bool:
        return name in self._tools or name in self._factories
