"""
src/core/interrupt.py
---------------------
LangGraph-based human-in-the-loop interrupt support.

Uses LangGraph's native ``interrupt()`` / ``Command(resume=...)`` mechanism.

Usage inside a LangGraph node::

    from telaios.core.interrupt import LangGraphInterrupt

    interrupt_handler = LangGraphInterrupt()
    resume_value = interrupt_handler.wait_for_resume("Your question here?")

``interrupt()`` is a **synchronous** function — it raises ``GraphInterrupt``
internally and LangGraph catches it.  Do NOT wrap it in ``async def``; calling
``await interrupt_handler.wait_for_resume()`` inside a node is incorrect.

To resume, call the graph again with ``Command(resume=<value>)``.
"""

from __future__ import annotations

from typing import Any


class LangGraphInterrupt:
    """
    Human-in-the-loop interrupt using LangGraph's native mechanism.

    Call ``wait_for_resume(message)`` inside a LangGraph node to pause
    execution and return control to the caller.  LangGraph will raise
    ``GraphInterrupt`` internally; when the graph is resumed via
    ``Command(resume=<value>)`` this call returns the provided value.

    Note: ``interrupt()`` is synchronous — do NOT place this inside an
    ``async def`` and do NOT ``await`` the result.
    """

    def wait_for_resume(self, message: str = "Waiting for human input...") -> Any:
        """Pause the graph and return the human-provided resume value.

        Must be called from inside a LangGraph node function.
        The graph is resumed by re-invoking it with
        ``Command(resume=<value>)``.
        """
        from langgraph.types import interrupt

        return interrupt(message)
