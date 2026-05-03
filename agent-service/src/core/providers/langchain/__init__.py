"""
src/core/providers/langchain/__init__.py
-----------------------------------------
Auto-registers all LangChain providers into the core registry.

This module is imported by ``core/__init__.py`` on first load via a
``try/except ImportError`` best-effort import.  No code in ``core/`` imports
this directly, keeping all LangChain symbols safely inside
``core/providers/langchain/``.

To register these providers explicitly (e.g. in tests or application startup)::

    import core.providers.langchain  # triggers auto-registration
"""

from __future__ import annotations

from core.providers import register_agent, register_orchestrator, register_rag, register_retriever
from core.providers.langchain.agent import LangChainAgent
from core.providers.langchain.orchestrator import LangChainOrchestrator
from core.providers.langchain.rag import LangChainRetriever, LangChainSimpleRAG

register_agent("langchain", LangChainAgent)
register_retriever("langchain", LangChainRetriever)
register_rag("langchain", LangChainSimpleRAG)
register_orchestrator("langchain", LangChainOrchestrator)

__all__ = [
    "LangChainAgent",
    "LangChainOrchestrator",
    "LangChainRetriever",
    "LangChainSimpleRAG",
]
