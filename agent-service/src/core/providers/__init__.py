"""
src/core/providers/__init__.py
------------------------------
Provider registry for the core factory.

Every concrete ``Agent``, ``Retriever``, ``RAG``, and ``Orchestrator``
implementation is registered here by its framework key.  The factory reads
this registry to dispatch ``create_agent(config)`` to the right class.

Registration
~~~~~~~~~~~~
Each provider sub-package registers itself by calling ``register_*()`` in its
own ``__init__.py``.  The preferred entry point is ``register_provider()`` in
``core/__init__.py``, which populates all relevant registries in one call.

Adding a new provider
~~~~~~~~~~~~~~~~~~~~~
1. Create ``core/providers/<name>/`` with ``agent.py``, ``orchestrator.py``, etc.
2. In ``core/providers/<name>/__init__.py`` call ``register_agent()``,
   ``register_orchestrator()``, etc.
3. The provider is now available to ``create_agent()`` / ``create_orchestrator()``.
   No changes to ``factory.py`` are required.
"""

from __future__ import annotations

from core.agent import Agent
from core.orchestrator import Orchestrator
from core.rag import RAG, Retriever

# Registries: framework key → concrete class
AGENT_REGISTRY: dict[str, type[Agent]] = {}
RETRIEVER_REGISTRY: dict[str, type[Retriever]] = {}
RAG_REGISTRY: dict[str, type[RAG]] = {}
ORCHESTRATOR_REGISTRY: dict[str, type[Orchestrator]] = {}


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
