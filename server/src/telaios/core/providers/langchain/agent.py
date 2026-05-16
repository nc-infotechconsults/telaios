"""
src/core/providers/langchain/agent.py
--------------------------------------
Backward-compatibility shim.  Agent logic has moved to ``core.agent``.
"""

from telaios.core.agent import Agent, LangChainAgent  # noqa: F401

__all__ = ["Agent", "LangChainAgent"]
