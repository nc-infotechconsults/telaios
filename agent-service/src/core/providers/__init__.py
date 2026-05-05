"""
src/core/providers/__init__.py
------------------------------
Provider registry for the core factory.

Every concrete ``Agent``, ``Retriever``, ``RAG``, ``Orchestrator``,
``InterruptHandle``, and ``Checkpointer`` implementation is registered here
by its framework key.  The factory reads this registry to dispatch
``create_agent(config)`` to the right class.

Registration
~~~~~~~~~~~~
Each provider sub-package registers itself by calling ``register_*()`` in its
own ``__init__.py``.  The preferred entry point is ``register_provider()``
which populates all relevant registries in one call.

Adding a new provider
~~~~~~~~~~~~~~~~~~~~~
1. Create ``core/providers/<name>/`` with ``agent.py``, ``orchestrator.py``, etc.
2. In ``core/providers/<name>/__init__.py`` call ``register_provider()`` with
   the concrete classes.
3. The provider is now available to ``create_agent()`` / ``create_orchestrator()``.
   No changes to ``factory.py`` are required.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from core.agent import Agent
from core.orchestrator import Orchestrator
from core.rag import RAG, Retriever

if TYPE_CHECKING:
    from core.checkpoint import Checkpointer
    from core.interrupt import InterruptHandle

# Registries: framework key → concrete class
AGENT_REGISTRY: dict[str, type[Agent]] = {}
RETRIEVER_REGISTRY: dict[str, type[Retriever]] = {}
RAG_REGISTRY: dict[str, type[RAG]] = {}
ORCHESTRATOR_REGISTRY: dict[str, type[Orchestrator]] = {}
INTERRUPT_REGISTRY: dict[str, type[InterruptHandle]] = {}
CHECKPOINTER_REGISTRY: dict[str, type[Checkpointer]] = {}


def register_agent(framework: str, cls: type[Agent]) -> None:
    """Register a concrete ``Agent`` implementation for *framework*."""
    AGENT_REGISTRY[framework] = cls


def register_retriever(framework: str, cls: type[Retriever]) -> None:
    """Register a concrete ``Retriever`` implementation for *framework*."""
    RETRIEVER_REGISTRY[framework] = cls


def register_rag(framework: str, cls: type[RAG]) -> None:
    """Register a concrete ``RAG`` implementation for *framework*."""
    RAG_REGISTRY[framework] = cls


def register_orchestrator(framework: str, cls: type[Orchestrator]) -> None:
    """Register a concrete ``Orchestrator`` implementation for *framework*."""
    ORCHESTRATOR_REGISTRY[framework] = cls


def register_provider(
    framework: str,
    *,
    agent_cls: type[Agent] | None = None,
    orchestrator_cls: type[Orchestrator] | None = None,
    retriever_cls: type[Retriever] | None = None,
    rag_cls: type[RAG] | None = None,
    interrupt_cls: type[InterruptHandle] | None = None,
    checkpointer_cls: type[Checkpointer] | None = None,
) -> None:
    """
    Register a framework's concrete implementations in one call.

    All parameters are optional — only the registries for provided classes
    are updated.  This is the preferred entry point over calling the
    individual ``register_*()`` functions.
    """
    if agent_cls is not None:
        AGENT_REGISTRY[framework] = agent_cls
    if orchestrator_cls is not None:
        ORCHESTRATOR_REGISTRY[framework] = orchestrator_cls
    if retriever_cls is not None:
        RETRIEVER_REGISTRY[framework] = retriever_cls
    if rag_cls is not None:
        RAG_REGISTRY[framework] = rag_cls
    if interrupt_cls is not None:
        INTERRUPT_REGISTRY[framework] = interrupt_cls  # type: ignore[assignment]
    if checkpointer_cls is not None:
        CHECKPOINTER_REGISTRY[framework] = checkpointer_cls  # type: ignore[assignment]
