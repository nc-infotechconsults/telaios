"""
src/tools/mcp/adapter.py
-------------------------
Convert an MCP ``Tool`` schema into a ``core.types.ToolInputSchema``.

This module only deals with schema translation — it has no I/O side-effects.
"""

from __future__ import annotations

from typing import Any, Literal

from telaios.core.types import ToolInputSchema, ToolParameter


def _json_schema_to_parameter(schema: dict[str, Any]) -> ToolParameter:
    """Recursively convert a JSON Schema dict to a ``ToolParameter``."""
    raw_type: str = schema.get("type", "string")
    # Coerce to one of the allowed literal values; fall back to "string".
    allowed: set[str] = {"string", "number", "integer", "boolean", "array", "object"}
    param_type: Literal[
        "string", "number", "integer", "boolean", "array", "object"
    ] = raw_type if raw_type in allowed else "string"  # type: ignore[assignment]

    items: ToolParameter | None = None
    if param_type == "array" and "items" in schema:
        items = _json_schema_to_parameter(schema["items"])

    properties: dict[str, ToolParameter] | None = None
    if param_type == "object" and "properties" in schema:
        properties = {
            k: _json_schema_to_parameter(v)
            for k, v in schema["properties"].items()
        }

    enum_values: list[str | int | bool] | None = schema.get("enum")

    return ToolParameter(
        type=param_type,
        description=schema.get("description"),
        enum=enum_values,
        items=items,
        properties=properties,
        required=schema.get("required"),
        default=schema.get("default"),
    )


def mcp_schema_to_input_schema(input_schema: dict[str, Any]) -> ToolInputSchema:
    """Convert an MCP tool's ``inputSchema`` dict to a ``ToolInputSchema``.

    Args:
        input_schema: The raw ``inputSchema`` dict from an MCP ``Tool`` object.

    Returns:
        A ``ToolInputSchema`` suitable for use in an ``ExecutableTool``.
    """
    raw_properties: dict[str, Any] = input_schema.get("properties") or {}
    properties: dict[str, ToolParameter] = {
        name: _json_schema_to_parameter(prop_schema)
        for name, prop_schema in raw_properties.items()
    }
    return ToolInputSchema(
        properties=properties or None,
        required=input_schema.get("required"),
    )
