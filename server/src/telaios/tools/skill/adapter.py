"""
src/tools/skill/adapter.py
---------------------------
Convert skills to ``ExecutableTool`` objects.

Supports two skill representations:
1. ``Skill`` (from ``core.types``) — legacy format
2. ``SkillManifest`` (from ``tools.skill.types``) — filesystem-based format

When the agent calls a skill tool, the coroutine can:
- Return the skill's instructions text (for guidance)
- Execute the skill's scripts (for automation)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from telaios.core.types import Skill, ToolAnnotations
from telaios.tools.types import ExecutableTool

if TYPE_CHECKING:
    from telaios.tools.skill.types import SkillManifest


def skill_to_executable_tool(skill: Skill) -> ExecutableTool:
    """Convert a legacy ``Skill`` to an ``ExecutableTool``.

    The resulting tool's coroutine returns ``skill.instructions`` regardless
    of the kwargs it receives; its input schema mirrors ``skill.inputSchema``
    so the LLM can pass the expected parameters.

    Args:
        skill: The ``Skill`` to convert.

    Returns:
        An ``ExecutableTool`` representing the skill.
    """
    skill_instructions = skill.instructions

    async def _invoke(**kwargs: Any) -> str:
        return skill_instructions

    return ExecutableTool(
        name=skill.name,
        description=skill.description,
        input_schema=skill.inputSchema,
        output_schema=skill.outputSchema,
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_invoke,
    )


def manifest_to_executable_tool(manifest: SkillManifest) -> ExecutableTool:
    """
    Convert a ``SkillManifest`` (filesystem-based skill) to an ``ExecutableTool``.

    The tool's behavior depends on the skill's scripts:
    - If scripts exist, the tool executes the primary script with arguments
    - If no scripts, it returns the instructions as guidance

    Args:
        manifest: The ``SkillManifest`` to convert.

    Returns:
        An ``ExecutableTool`` that can execute the skill's scripts.
    """
    from telaios.tools.skill.executor import ScriptExecutor
    from telaios.tools.skill.types import SkillManifest

    if not isinstance(manifest, SkillManifest):
        raise TypeError(f"Expected SkillManifest, got {type(manifest)}")

    has_scripts = len(manifest.scripts) > 0

    async def _invoke(**kwargs: Any) -> str:
        if has_scripts:
            # Execute the primary script
            executor = ScriptExecutor()
            script_name = kwargs.get("script", manifest.scripts[0].name)
            args = kwargs.get("args", [])

            # Find the script
            script = next(
                (s for s in manifest.scripts if s.name == script_name),
                manifest.scripts[0],
            )

            try:
                result = await executor.execute(script, args=args)
                output = result.stdout
                if result.stderr:
                    output += f"\n\n[stderr]\n{result.stderr}"
                if not result.success:
                    output += f"\n\n[exit code: {result.exit_code}]"
                return output
            except Exception as exc:
                return f"Error executing skill script: {exc}"
        else:
            # No scripts — return instructions as guidance
            return manifest.instructions

    # Build input schema from script arguments
    properties: dict[str, Any] = {}
    if has_scripts and len(manifest.scripts) > 1:
        properties["script"] = {
            "type": "string",
            "description": "Script to execute",
            "enum": [s.name for s in manifest.scripts],
        }

    # Add arguments property
    if has_scripts and manifest.scripts[0].arguments:
        properties["args"] = {
            "type": "array",
            "items": {"type": "string"},
            "description": f"Arguments: {', '.join(manifest.scripts[0].arguments)}",
        }

    from telaios.core.types import ToolInputSchema, ToolParameter

    input_schema = ToolInputSchema(
        type="object",
        properties={k: ToolParameter(**v) for k, v in properties.items()} if properties else None,
        required=list(properties.keys()) if properties else None,
    )

    return ExecutableTool(
        name=manifest.name,
        description=manifest.description,
        input_schema=input_schema,
        annotations=ToolAnnotations(read_only=False, idempotent=False),
        coroutine=_invoke,
    )
