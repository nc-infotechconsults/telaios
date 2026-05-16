"""
core — LangChain/LangGraph agent and LLM utilities.

Public API
~~~~~~~~~~
Factory functions (preferred entry points)::

    from telaios.core import create_agent, create_llm

Domain types::

    from telaios.core.types import AgentConfig, LLMConfig, Message, ...
"""

from __future__ import annotations

import logging

from telaios.core.agent import Agent, LangChainAgent
from telaios.core.checkpoint import PostgresCheckpointer
from telaios.core.factory import (
    _build_llm_config,
    create_agent,
    create_agent_with_config,
    create_llm,
)
from telaios.core.graph_store import GraphStore
from telaios.core.llm import LLM, LangChainLLM, build_llm

logger = logging.getLogger(__name__)


__all__ = [  # noqa: RUF022
    # Agent
    "Agent",
    "LangChainAgent",
    # Checkpoint
    "PostgresCheckpointer",
    # LLM
    "LLM",
    "LangChainLLM",
    "build_llm",
    # Graph store
    "GraphStore",
    # Factory
    "create_agent",
    "create_agent_with_config",
    "create_llm",
    "_build_llm_config",
]
