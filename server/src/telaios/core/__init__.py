"""
core — LangChain/LangGraph agent and LLM utilities.

Public API
~~~~~~~~~~
Factory functions (preferred entry points)::

    from telaios.core import create_agent, create_llm

Domain types::

    from telaios.core.types import AgentConfig, LLMConfig, Message, ...

Knowledge pipeline::

    from telaios.core.knowledge import KnowledgeBasePipeline, KnowledgePipelineConfig
    from telaios.core.knowledge.factory import KnowledgePipelineFactory
"""

from __future__ import annotations

import logging

from telaios.core.agent import LangChainAgent
from telaios.core.checkpoint import PostgresCheckpointer
from telaios.core.factory import (
    _build_llm_config,
    create_agent,
    create_agent_with_config,
    create_llm,
)
from telaios.core.fake_llm import FakeLLM
from telaios.core.knowledge import KnowledgeBasePipeline, KnowledgePipelineConfig
from telaios.core.knowledge_source import (
    DoclingSource,
    FileSource,
    GitHubSource,
    KnowledgeSource,
    SourceDocument,
    TextSource,
    URLSource,
)
from telaios.core.llm import LLM, LangChainLLM, build_llm
from telaios.core.stores.graph import GraphStore

logger = logging.getLogger(__name__)


__all__ = [  # noqa: RUF022
    # Agent
    "LangChainAgent",
    # Checkpoint
    "PostgresCheckpointer",
    # LLM
    "LLM",
    "LangChainLLM",
    "build_llm",
    # Graph store
    "GraphStore",
    # Knowledge pipeline
    "KnowledgeBasePipeline",
    "KnowledgePipelineConfig",
    # Utils
    "FakeLLM",
    # Knowledge sources
    "KnowledgeSource",
    "SourceDocument",
    "TextSource",
    "FileSource",
    "URLSource",
    "GitHubSource",
    "DoclingSource",
    # Factory
    "create_agent",
    "create_agent_with_config",
    "create_llm",
    "_build_llm_config",
]
