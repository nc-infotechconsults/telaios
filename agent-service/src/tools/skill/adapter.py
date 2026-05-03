"""
src/tools/skill/adapter.py
---------------------------
Convert a ``Skill`` (from ``core.types``) into an ``ExecutableTool``.

When the agent calls this tool the coroutine returns the skill's
``instructions`` text so the LLM can follow the prescribed workflow.
"""

from __future__ import annotations

from typing import Any

from core.types import Skill, ToolAnnotations
from tools.types import ExecutableTool


def skill_to_executable_tool(skill: Skill) -> ExecutableTool:
    """Convert *skill* to an ``ExecutableTool``.

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
