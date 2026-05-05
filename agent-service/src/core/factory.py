"""
src/core/factory.py
-------------------
Factory functions for creating framework-agnostic agent and RAG instances.

Usage
~~~~~
::

    from core import create_agent, create_orchestrator, create_retriever, create_rag
    from core.types import AgentConfig, LLMConfig, RagConfig, SubAgentConfig

    # Simple agent
    agent = create_agent(AgentConfig(llm=LLMConfig(provider="openai", model="gpt-4o")))

    # Orchestrator with mixed-provider sub-agents
    from core import register_provider
    register_provider("openai", agent_cls=MyOpenAIAgent)  # register at any time

    config = AgentConfig(
        framework="langchain",
        llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
        sub_agents=[
            SubAgentConfig(
                name="reviewer",
                description="Reviews code",
                agent_config=AgentConfig(framework="openai", llm=LLMConfig(...)),
            ),
        ],
    )
    orchestrator = create_orchestrator(config)

How dispatch works
~~~~~~~~~~~~~~~~~~
1. ``AgentConfig.framework`` (default ``"langchain"``) is used as a registry key.
2. The factory looks up the registered class in the provider registry.
3. If the framework is not registered, a ``ValueError`` is raised with a helpful
   message reminding the caller to register the provider first.

Registering providers
~~~~~~~~~~~~~~~~~~~~~
Use ``register_provider()`` from ``core/__init__.py``::

    from core import register_provider
    register_provider("myfw", agent_cls=MyAgent, orchestrator_cls=MyOrchestrator)

Providers can be registered at any time — before or after the factory is called.
The registry is the sole source of truth; there is no startup-time auto-loading
in this module.
"""

from __future__ import annotations

import logging
from typing import Any

from core.agent import Agent
from core.llm import LLM, LLMFactory
from core.orchestrator import Orchestrator
from core.rag import RAG, Retriever
from core.types import AgentConfig, LLMConfig, RagConfig

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_llm_config(
    settings: dict[str, Any],
    overrides: dict[str, Any] | None = None,
) -> LLMConfig:
    """Build an ``LLMConfig`` from a raw settings dict.

    *settings* is the baseline configuration (typically from the application
    settings / env vars).  *overrides* is an optional per-agent dict whose
    non-``None`` values take precedence over *settings*.

    The API key is decrypted via ``infra.crypto.decrypt`` when it looks
    encrypted (non-empty).  A plain-text ``llm_api_key_raw`` fallback is
    used when no encrypted key is available.

    Expected keys (both dicts):
        ``llm_provider``   — provider name (``"openai"``, ``"anthropic"``, …)
        ``llm_model``      — model identifier
        ``llm_api_key``    — encrypted API key (``iv_hex:ciphertext_hex``)
        ``llm_api_key_raw``— plain-text API key (fallback)
        ``llm_base_url``   — optional base URL override
        ``llm_temperature`` — optional temperature
        ``llm_max_tokens``  — optional max tokens
        ``llm_top_p``       — optional top-p
        ``llm_frequency_penalty`` — optional frequency penalty
        ``llm_presence_penalty``  — optional presence penalty
    """
    ov = overrides or {}

    def _pick(key: str, default: Any = None) -> Any:
        return ov.get(key) if ov.get(key) is not None else settings.get(key, default)

    # Resolve API key — prefer encrypted, fall back to raw.
    raw_key = _pick("llm_api_key", "")
    if raw_key:
        from infra.crypto import decrypt  # noqa: PLC0415 — deferred

        api_key = decrypt(raw_key)
    else:
        api_key = _pick("llm_api_key_raw", "")
    if not api_key:
        api_key = ""

    return LLMConfig(
        provider=_pick("llm_provider", "openai"),
        model=_pick("llm_model", "gpt-4o"),
        api_key=api_key,
        base_url=_pick("llm_base_url"),
        temperature=_pick("llm_temperature"),
        max_tokens=_pick("llm_max_tokens"),
        top_p=_pick("llm_top_p"),
        frequency_penalty=_pick("llm_frequency_penalty"),
        presence_penalty=_pick("llm_presence_penalty"),
    )


def create_llm(config: LLMConfig) -> LLM:
    """
    Instantiate the ``LLM`` implementation for ``config.provider``.

    Args:
        config: LLM configuration including provider, model, and options.

    Returns:
        An ``LLM`` instance backed by the requested provider.

    Raises:
        ValueError: if ``config.provider`` is not registered.
    """
    return LLMFactory.create(
        provider=config.provider,
        config=config,
    )


def create_agent(config: AgentConfig) -> Agent:
    """
    Instantiate the ``Agent`` implementation for ``config.framework``.

    Args:
        config: Full agent configuration including the framework key.

    Returns:
        An ``Agent`` instance backed by the requested framework.

    Raises:
        ValueError: if ``config.framework`` is not registered.
    """
    from core.providers import AGENT_REGISTRY  # noqa: PLC0415 — deferred to avoid cycles

    cls = AGENT_REGISTRY.get(config.framework)
    if cls is None:
        raise ValueError(
            f"Unknown agent framework: {config.framework!r}. "
            f"Registered frameworks: {list(AGENT_REGISTRY)}. "
            "Call register_provider() to add a new framework."
        )
    return cls(config)


def create_orchestrator(config: AgentConfig) -> Orchestrator:
    """
    Instantiate the ``Orchestrator`` for ``config.framework`` and wire sub-agents.

    Sub-agents in ``config.sub_agents`` are built via ``create_agent()`` — each
    may use its own framework (different from the orchestrator's framework).
    Additional sub-agents can be added at runtime via
    ``orchestrator.add_sub_agent()``.

    Args:
        config: Full agent configuration.  ``config.sub_agents`` entries whose
                ``agent_config`` is not ``None`` are automatically wired.

    Returns:
        An ``Orchestrator`` instance with sub-agents already registered.

    Raises:
        ValueError: if ``config.framework`` has no orchestrator registered.
    """
    from core.providers import ORCHESTRATOR_REGISTRY  # noqa: PLC0415

    cls = ORCHESTRATOR_REGISTRY.get(config.framework)
    if cls is None:
        raise ValueError(
            f"Unknown orchestrator framework: {config.framework!r}. "
            f"Registered frameworks: {list(ORCHESTRATOR_REGISTRY)}. "
            "Call register_provider() to add a new framework."
        )

    orchestrator = cls(config)

    for sub in config.sub_agents:
        if sub.agent_config is not None:
            sub_agent = create_agent(sub.agent_config)  # uses sub-agent's own framework
            orchestrator.add_sub_agent(sub.name, sub_agent, sub.description)
            logger.debug(
                "Wired sub-agent %r (framework=%r) into orchestrator (framework=%r)",
                sub.name,
                sub.agent_config.framework,
                config.framework,
            )

    return orchestrator


def create_retriever(config: RagConfig, **kwargs: Any) -> Retriever:
    """
    Instantiate the ``Retriever`` implementation for ``config.framework``.

    Args:
        config: RAG configuration; ``config.framework`` determines which
                provider is used.
        **kwargs: Extra arguments forwarded to the retriever constructor.
                  For ``LangChainRetriever`` pass ``lc_retriever=<instance>``.

    Returns:
        A ``Retriever`` instance backed by the requested framework.

    Raises:
        ValueError: if ``config.framework`` is not registered.
    """
    from core.providers import RETRIEVER_REGISTRY  # noqa: PLC0415

    cls = RETRIEVER_REGISTRY.get(config.framework)
    if cls is None:
        raise ValueError(
            f"Unknown retriever framework: {config.framework!r}. "
            f"Registered frameworks: {list(RETRIEVER_REGISTRY)}. "
            "Call register_provider() to add a new framework."
        )
    return cls(**kwargs)


def create_rag(
    config: RagConfig,
    retriever: Retriever | None = None,
    **kwargs: Any,
) -> RAG:
    """
    Instantiate the ``RAG`` implementation for ``config.framework``.

    Args:
        config: Full RAG configuration including ``llm``, ``embedding``,
                optional ``vector_store`` / ``graph_store``, and ``framework``.
        retriever: An optional pre-built ``Retriever``.  If omitted,
                   ``create_retriever(config, **kwargs)`` is called to build one.
        **kwargs: Extra arguments forwarded to ``create_retriever`` when
                  ``retriever`` is ``None``.

    Returns:
        A ``RAG`` instance backed by the requested framework.

    Raises:
        ValueError: if ``config.framework`` is not registered.
    """
    if retriever is None:
        retriever = create_retriever(config, **kwargs)

    from core.providers import RAG_REGISTRY  # noqa: PLC0415

    cls = RAG_REGISTRY.get(config.framework)
    if cls is None:
        raise ValueError(
            f"Unknown RAG framework: {config.framework!r}. "
            f"Registered frameworks: {list(RAG_REGISTRY)}. "
            "Call register_provider() to add a new framework."
        )
    return cls(retriever, config)


def create_agent_with_config(
    settings: dict[str, Any],
    agent_overrides: dict[str, Any] | None = None,
    framework: str = "langchain",
    system_prompt: str | None = None,
) -> tuple[AgentConfig, Agent]:
    """Build an ``AgentConfig`` from raw settings dicts and instantiate the agent.

    This is the single entry point for building profile-driven agent configs.
    It handles encrypted key decryption and merges baseline *settings* with
    per-agent *agent_overrides*.

    Args:
        settings: Baseline LLM settings (from env / application config).
        agent_overrides: Per-agent overrides whose non-``None`` values win.
        framework: Agent framework key (default ``"langchain"``).
        system_prompt: Optional system prompt for the agent.

    Returns:
        A ``(AgentConfig, Agent)`` tuple.
    """
    llm_config = _build_llm_config(settings, agent_overrides)
    agent_config = AgentConfig(
        framework=framework,
        llm=llm_config,
        system_prompt=system_prompt,
    )
    agent = create_agent(agent_config)
    return agent_config, agent
