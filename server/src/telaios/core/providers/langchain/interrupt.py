"""
src/core/providers/langchain/interrupt.py
------------------------------------------
Backward-compatibility shim.  Interrupt logic has moved to ``core.interrupt``.
"""

from telaios.core.interrupt import LangGraphInterrupt  # noqa: F401

# Keep the old name for any existing code that imported InterruptHandle
InterruptHandle = LangGraphInterrupt

__all__ = ["LangGraphInterrupt", "InterruptHandle"]
