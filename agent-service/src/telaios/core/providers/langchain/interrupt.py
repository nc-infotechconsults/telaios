"""
core/providers/langchain/interrupt.py
--------------------------------------
LangGraph-based human-in-the-loop interrupt implementation.

Uses LangGraph's native ``interrupt()`` / ``Command(resume=...)`` mechanism.
Domain code depends only on the ``InterruptHandle`` ABC — this module is
imported only by the LangGraph provider registration in ``__init__.py``.
"""

from __future__ import annotations

from typing import Any

from langgraph.errors import GraphInterrupt
from langgraph.types import Interrupt, interrupt

from telaios.core.interrupt import InterruptHandle


class LangGraphInterrupt(InterruptHandle):
    """
    LangGraph-based interrupt handle using native interrupt()/Command.

    Inside a LangGraph graph node:
    - ``send_interrupt(message)`` raises ``GraphInterrupt`` to pause execution.
    - ``wait_for_resume()`` calls ``interrupt()`` and returns the resume value
      when the graph is resumed with ``Command(resume=...)``.
    """

    async def wait_for_resume(self) -> Any:
        """Pause the graph and wait for a human resume value."""
        return interrupt("Waiting for human input...")

    def send_interrupt(self, message: str) -> None:
        """Raise a GraphInterrupt to pause execution with the given message."""
        raise GraphInterrupt([Interrupt(value=message)])
