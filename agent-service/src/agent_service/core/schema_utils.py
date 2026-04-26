from __future__ import annotations

from typing import Any, Dict, Optional


def build_pydantic_model_from_schema(schema: Dict, model_name: str = "DynamicModel"):
    """Build a Pydantic model dynamically from a JSON Schema dict."""
    from pydantic import create_model
    from pydantic import Field as PydanticField

    properties = schema.get("properties") or {}
    required_fields = set(schema.get("required") or [])
    type_map = {"string": str, "number": float, "integer": int, "boolean": bool}

    field_defs: Dict[str, Any] = {}
    for field_name, prop in properties.items():
        type_str = prop.get("type", "string")
        if isinstance(type_str, list):
            type_str = type_str[0]
        annotation = type_map.get(type_str, str)
        default = ... if field_name in required_fields else None
        field_defs[field_name] = (
            Optional[annotation] if default is None else annotation,
            PydanticField(default, description=prop.get("description", "")),
        )

    return create_model(model_name, **field_defs) if field_defs else create_model(model_name)
