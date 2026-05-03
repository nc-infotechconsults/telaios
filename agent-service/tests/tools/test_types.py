"""tests/tools/test_types.py — ExecutableTool construction and validation."""

from __future__ import annotations

import pytest

from core.types import ToolAnnotations, ToolInputSchema, ToolParameter
from tools.types import ExecutableTool


async def _dummy(**kwargs):
    return "ok"


def _make_tool(**overrides) -> ExecutableTool:
    defaults = dict(
        name="my_tool",
        description="A test tool",
        input_schema=ToolInputSchema(
            properties={"x": ToolParameter(type="string", description="param x")},
            required=["x"],
        ),
        coroutine=_dummy,
    )
    defaults.update(overrides)
    return ExecutableTool(**defaults)


class TestExecutableTool:
    def test_basic_construction(self):
        tool = _make_tool()
        assert tool.name == "my_tool"
        assert tool.description == "A test tool"
        assert tool.coroutine is _dummy

    def test_inherits_tool_definition_fields(self):
        tool = _make_tool()
        assert tool.input_schema.required == ["x"]
        assert "x" in tool.input_schema.properties

    def test_default_annotations(self):
        tool = _make_tool()
        assert tool.annotations == ToolAnnotations()

    def test_custom_annotations(self):
        ann = ToolAnnotations(read_only=True, idempotent=True)
        tool = _make_tool(annotations=ann)
        assert tool.annotations.read_only is True

    def test_coroutine_is_callable(self):
        tool = _make_tool()
        assert callable(tool.coroutine)

    async def test_coroutine_invocable(self):
        tool = _make_tool()
        result = await tool.coroutine(x="hello")
        assert result == "ok"

    def test_missing_coroutine_raises(self):
        with pytest.raises(Exception):
            ExecutableTool(
                name="bad",
                description="missing coroutine",
                input_schema=ToolInputSchema(properties={}),
                # coroutine intentionally omitted
            )

    def test_non_callable_coroutine_raises(self):
        with pytest.raises(Exception):
            ExecutableTool(
                name="bad",
                description="not callable",
                input_schema=ToolInputSchema(properties={}),
                coroutine="not_a_function",  # type: ignore[arg-type]
            )
