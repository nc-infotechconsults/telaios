"""
src/core/providers/langchain/checkpoint.py
-------------------------------------------
Backward-compatibility shim.  Checkpoint logic has moved to ``core.checkpoint``.
"""

from telaios.core.checkpoint import PostgresCheckpointer  # noqa: F401

__all__ = ["PostgresCheckpointer"]
