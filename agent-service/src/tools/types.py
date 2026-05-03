"""
src/tools/types.py
------------------
``ExecutableTool`` — a ``ToolDefinition`` with an attached async coroutine.

This module deliberately has **no** LangChain imports.  Framework-specific
conversion happens exclusively in ``src/core/providers/``.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from pydantic import ConfigDict

from core.types import ToolDefinition


class ExecutableTool(ToolDefinition):
    """A ``ToolDefinition`` extended with an async implementation.

    The ``coroutine`` receives keyword arguments matching ``input_schema``
    and must return a plain ``str`` (the tool result shown to the LLM).

    Example::

        async def my_impl(**kwargs: Any) -> str:
            return f"result: {kwargs}"

        tool = ExecutableTool(
            name="my_tool",
            description="Does something",
            input_schema=ToolInputSchema(properties={}),
            coroutine=my_impl,
        )
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    coroutine: Callable[..., Awaitable[str]]
