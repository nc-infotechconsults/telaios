"""
src/core/interrupt.py
---------------------
LangGraph-based human-in-the-loop interrupt support.

Uses LangGraph's native ``interrupt()`` / ``Command(resume=...)`` mechanism.

Usage inside a LangGraph node::

    from telaios.core.interrupt import LangGraphInterrupt

    interrupt = LangGraphInterrupt()
    resume_value = await interrupt.wait_for_resume()
"""

from __future__ import annotations

from typing import Any


class LangGraphInterrupt:
    """
    Human-in-the-loop interrupt using LangGraph's native mechanism.

    - ``send_interrupt(message)`` raises ``GraphInterrupt`` to pause execution.
    - ``wait_for_resume()`` calls ``interrupt()`` and returns the resume value
      when the graph is resumed with ``Command(resume=...)``.
    """

    async def wait_for_resume(self) -> Any:
        """Pause the graph and wait for a human resume value."""
        from langgraph.types import interrupt

        return interrupt("Waiting for human input...")

    def send_interrupt(self, message: str) -> None:
        """Raise a GraphInterrupt to pause execution with the given message."""
        from langgraph.errors import GraphInterrupt
        from langgraph.types import Interrupt

        raise GraphInterrupt([Interrupt(value=message)])
