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

from telaios.core.providers import register_agent, register_orchestrator, register_provider, register_rag, register_retriever
from telaios.core.providers.langchain.agent import LangChainAgent
from telaios.core.providers.langchain.checkpoint import PostgresCheckpointer
from telaios.core.providers.langchain.interrupt import LangGraphInterrupt
from telaios.core.providers.langchain.llm import LangChainLLM
from telaios.core.providers.langchain.orchestrator import LangChainOrchestrator
from telaios.core.providers.langchain.rag import LangChainRAG, LangChainRetriever, LangChainSimpleRAG
from telaios.core.providers.langchain.retriever_bm25 import BM25Retriever

register_agent("langchain", LangChainAgent)
register_retriever("langchain", LangChainRetriever)
register_rag("langchain", LangChainRAG)
register_orchestrator("langchain", LangChainOrchestrator)

# Register HITL and checkpoint providers
register_provider(
    "langchain",
    interrupt_cls=LangGraphInterrupt,
    checkpointer_cls=PostgresCheckpointer,
)

__all__ = [
    "LangChainAgent",
    "LangChainOrchestrator",
    "LangChainRetriever",
    "LangChainRAG",
    "LangChainSimpleRAG",
    "LangChainLLM",
    "BM25Retriever",
    "LangGraphInterrupt",
    "PostgresCheckpointer",
]
