"""
src/tools/builtin/finish_tools.py
----------------------------------
Generic "finish" tool whose output schema is configurable at construction time.

Use ``make_finish_tool`` to create a tool that signals the agent is done and
provides a structured final answer.  Pass ``output_fields`` to declare what
keys the agent must supply:

    make_finish_tool({"summary": "string", "status": "string"})

If ``output_fields`` is empty the coroutine accepts only a ``message`` field.
"""

from __future__ import annotations

from typing import Any, Literal

from telaios.core.types import ToolAnnotations, ToolInputSchema, ToolParameter
from telaios.tools.types import ExecutableTool

_VALID_TYPES = Literal["string", "number", "integer", "boolean"]

_DEFAULT_FIELD = "message"


def make_finish_tool(
    output_fields: dict[str, str] | None = None,
) -> ExecutableTool:
    """Return a ``finish`` ``ExecutableTool`` with a configurable schema.

    Args:
        output_fields: Mapping of field name → JSON-Schema primitive type
                       string (``"string"``, ``"number"``, etc.).  When
                       ``None`` or empty, defaults to a single ``message``
                       field of type ``"string"``.

    Returns:
        An ``ExecutableTool`` whose coroutine serialises all received kwargs
        and returns them as a plain-text summary.
    """
    fields: dict[str, str] = output_fields or {_DEFAULT_FIELD: "string"}

    properties: dict[str, ToolParameter] = {
        name: ToolParameter(type=ftype, description=f"The {name} output.")  # type: ignore[arg-type]
        for name, ftype in fields.items()
    }

    async def _finish(**kwargs: Any) -> str:
        if len(kwargs) == 1:
            return next(iter(kwargs.values()))
        parts = [f"{k}: {v}" for k, v in kwargs.items()]
        return "\n".join(parts) if parts else "Task finished."

    return ExecutableTool(
        name="finish",
        description=(
            "Signal that the task is complete and provide the final structured answer. "
            "Call this tool once you have gathered all required information."
        ),
        input_schema=ToolInputSchema(
            properties=properties,
            required=list(fields.keys()),
        ),
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_finish,
    )
