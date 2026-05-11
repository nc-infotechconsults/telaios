"""
src/core/interrupt.py
---------------------
Vendor-agnostic human-in-the-loop (HITL) interrupt contract.

Domain agents call ``send_interrupt()`` to pause execution and wait for human
input.  Concrete providers (e.g. LangGraph) map this to their native interrupt
mechanism under ``core/providers/``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class InterruptHandle(ABC):
    """
    Abstract handle for human-in-the-loop interrupts.

    Concrete implementations live under ``core/providers/<framework>/interrupt.py``.
    Domain code depends only on this ABC — never on a concrete provider.

    Example — domain agent usage::

        class MyAgent:
            def __init__(self, interrupt: InterruptHandle):
                self._interrupt = interrupt

            async def run(self):
                # ... do work ...
                self._interrupt.send_interrupt("Please review this output")
                resume_value = await self._interrupt.wait_for_resume()
                # ... continue with resume_value ...
    """

    @abstractmethod
    async def wait_for_resume(self) -> Any:
        """Block until a human provides a resume value."""
        ...

    @abstractmethod
    def send_interrupt(self, message: str) -> None:
        """Signal an interrupt with a message shown to the human."""
        ...
