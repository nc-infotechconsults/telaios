"""
core — framework-agnostic agent and RAG abstractions.

Public API
~~~~~~~~~~
Factory functions (preferred entry points)::

    from core import create_agent, create_orchestrator, create_retriever, create_rag

Abstract base classes (for type hints and sub-classing)::

    from core import Agent, Orchestrator, Retriever, RAG

Register a provider at any time (startup *or* runtime)::

    from core import register_provider
    from mypkg import MyAgent, MyOrchestrator
    register_provider("myfw", agent_cls=MyAgent, orchestrator_cls=MyOrchestrator)

Domain types::

    from core.types import AgentConfig, RagConfig, LLMConfig, SubAgentConfig, ...

Provider independence
~~~~~~~~~~~~~~~~~~~~~
The underlying framework (LangChain, etc.) is an implementation detail
determined by ``AgentConfig.framework`` / ``RagConfig.framework``
(default: ``"langchain"``).

The built-in LangChain provider is auto-loaded when ``core`` is imported
(best-effort; silently skipped if LangChain is not installed).  Any additional
provider must be registered explicitly via ``register_provider()``.
"""

from __future__ import annotations

import logging

from telaios.core.agent import Agent
from telaios.core.checkpoint import Checkpointer
from telaios.core.factory import (
    create_agent,
    create_agent_with_config,
    create_llm,
    create_orchestrator,
    create_rag,
    create_retriever,
)
from telaios.core.interrupt import InterruptHandle
from telaios.core.orchestrator import Orchestrator
from telaios.core.providers import (
    AGENT_REGISTRY,
    CHECKPOINTER_REGISTRY,
    INTERRUPT_REGISTRY,
    ORCHESTRATOR_REGISTRY,
    RAG_REGISTRY,
    RETRIEVER_REGISTRY,
    register_agent,
    register_orchestrator,
    register_rag,
    register_retriever,
)
from telaios.core.rag import RAG, Retriever

from telaios.core.graph_store import GraphStore
from telaios.core.llm import LLM, LLMFactory

logger = logging.getLogger(__name__)


def register_provider(
    framework: str,
    *,
    agent_cls: type[Agent] | None = None,
    retriever_cls: type[Retriever] | None = None,
    rag_cls: type[RAG] | None = None,
    orchestrator_cls: type[Orchestrator] | None = None,
    interrupt_cls: type[InterruptHandle] | None = None,
    checkpointer_cls: type[Checkpointer] | None = None,
) -> None:
    """
    Register one or more classes for *framework* into the provider registry.

    This is the single public API for adding a provider — built-in or external.
    Providers registered here are immediately available to all factory functions.
    Calling this multiple times with the same *framework* key replaces the
    previously registered class.

    Args:
        framework:         Registry key (e.g. ``"langchain"``, ``"openai"``).
        agent_cls:         ``Agent`` implementation for this framework.
        retriever_cls:     ``Retriever`` implementation for this framework.
        rag_cls:           ``RAG`` implementation for this framework.
        orchestrator_cls:  ``Orchestrator`` implementation for this framework.
        interrupt_cls:     ``InterruptHandle`` implementation for this framework.
        checkpointer_cls:  ``Checkpointer`` implementation for this framework.

    Example::

        from core import register_provider
        from mypkg.openai_agent import OpenAIAgent, OpenAIOrchestrator

        # Register at application startup
        register_provider("openai", agent_cls=OpenAIAgent, orchestrator_cls=OpenAIOrchestrator)

        # Or register at runtime when a plugin is loaded
        register_provider("plugin_x", agent_cls=PluginXAgent)
    """
    if agent_cls is not None:
        register_agent(framework, agent_cls)
    if retriever_cls is not None:
        register_retriever(framework, retriever_cls)
    if rag_cls is not None:
        register_rag(framework, rag_cls)
    if orchestrator_cls is not None:
        register_orchestrator(framework, orchestrator_cls)
    if interrupt_cls is not None:
        INTERRUPT_REGISTRY[framework] = interrupt_cls  # type: ignore[assignment]
    if checkpointer_cls is not None:
        CHECKPOINTER_REGISTRY[framework] = checkpointer_cls  # type: ignore[assignment]


# ── Auto-load built-in LangChain provider ─────────────────────────────────────
# Imported best-effort so that create_agent(AgentConfig()) works out of the
# box in environments where LangChain is installed, without requiring an
# explicit register_provider() call.

try:
    pass
except ImportError:
    logger.debug(
        "core: LangChain provider not available (langchain not installed). "
        "Install langchain-core or register a provider manually via register_provider()."
    )


__all__ = [
    # ABCs
    "Agent",
    "Checkpointer",
    "InterruptHandle",
    "Orchestrator",
    "Retriever",
    "RAG",
    "GraphStore",
    "LLM",
    # Factory
    "create_agent",
    "create_agent_with_config",
    "create_llm",
    "create_orchestrator",
    "create_retriever",
    "create_rag",
    # Provider registration
    "register_provider",
]
