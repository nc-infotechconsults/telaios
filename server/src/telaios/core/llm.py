"""
src/core/llm.py
---------------
LangChain-backed LLM implementation.

Provides ``LangChainLLM`` — a concrete wrapper around any LangChain
``BaseChatModel`` — and ``build_llm()`` to instantiate it from config.

Usage::

    from telaios.core.llm import build_llm
    from telaios.core.types import LLMConfig

    llm = build_llm(LLMConfig(provider="openai", model="gpt-4o", api_key="..."))
    response = await llm.invoke([Message(role=MessageRole.HUMAN, content="Hello")])
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from telaios.core.types import LLMConfig, Message, MessageRole


class LangChainLLM:
    """
    LLM implementation backed by a LangChain ``BaseChatModel``.

    Wraps any LangChain chat model (ChatOpenAI, ChatAnthropic, etc.) and
    exposes a simple async interface.

    Supported providers (via ``build_llm()``):
    - ``"anthropic"``  → ``ChatAnthropic``
    - anything else    → ``ChatOpenAI`` (covers OpenAI, Ollama, vLLM, …)
    """

    def __init__(self, config: LLMConfig) -> None:
        self._config = config
        self._model: Any | None = None

    def _get_model(self) -> Any:
        """Lazily build the underlying LangChain model."""
        if self._model is None:
            self._model = build_chat_model(self._config)
        return self._model

    async def invoke(self, messages: list[Message]) -> Message:
        """Send messages and get a single response."""
        model = self._get_model()
        lc_messages = _to_lc_messages(messages)
        response = await model.ainvoke(lc_messages)
        return _from_lc_message(response)

    async def astream(self, messages: list[Message]) -> AsyncIterator[str]:
        """Stream the model's response token by token."""
        model = self._get_model()
        lc_messages = _to_lc_messages(messages)
        async for chunk in model.astream(lc_messages):
            content = chunk.content
            if content:
                text = content if isinstance(content, str) else str(content)
                if text:
                    yield text

    async def invoke_structured(
        self,
        messages: list[Message],
        response_format: type[Any],
    ) -> Any:
        """Invoke with structured output parsing."""
        model = self._get_model()
        lc_messages = _to_lc_messages(messages)
        structured_model = model.with_structured_output(response_format)
        return await structured_model.ainvoke(lc_messages)


# ``LLM`` is kept as a public alias for backward compatibility with callers
# that imported ``from telaios.core.llm import LLM``.
LLM = LangChainLLM


def build_llm(cfg: LLMConfig) -> LangChainLLM:
    """
    Instantiate a ``LangChainLLM`` from an ``LLMConfig``.

    Args:
        cfg: LLM configuration including provider, model, and options.

    Returns:
        A ``LangChainLLM`` instance ready to use.
    """
    return LangChainLLM(cfg)


# ── Internal helpers ──────────────────────────────────────────────────────────


def build_chat_model(cfg: LLMConfig) -> Any:
    """
    Instantiate a LangChain ``BaseChatModel`` from an ``LLMConfig``.

    Supported providers:
    - ``"anthropic"``  → ``ChatAnthropic``
    - anything else    → ``ChatOpenAI`` (covers OpenAI, Ollama, vLLM, …)
    """
    extra: dict[str, str | float | int] = {}
    if cfg.temperature is not None:
        extra["temperature"] = cfg.temperature
    if cfg.max_tokens is not None:
        extra["max_tokens"] = cfg.max_tokens
    if cfg.top_p is not None:
        extra["top_p"] = cfg.top_p
    if cfg.base_url is not None:
        extra["base_url"] = cfg.base_url

    extra["api_key"] = cfg.api_key or "placeholder"

    if cfg.provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=cfg.model, **extra)

    # OpenAI and OpenAI-compatible providers
    from langchain_openai import ChatOpenAI

    if cfg.frequency_penalty is not None:
        extra["frequency_penalty"] = cfg.frequency_penalty
    if cfg.presence_penalty is not None:
        extra["presence_penalty"] = cfg.presence_penalty

    return ChatOpenAI(model=cfg.model, **extra)


def _to_lc_messages(messages: list[Message]) -> list[Any]:
    """Convert ``core.types.Message`` objects to LangChain message types."""
    from langchain_core.messages import (
        AIMessage,
        HumanMessage,
        SystemMessage,
        ToolMessage,
    )

    lc: list[Any] = []
    for msg in messages:
        if msg.role == MessageRole.SYSTEM:
            lc.append(SystemMessage(content=msg.content))
        elif msg.role == MessageRole.HUMAN:
            lc.append(HumanMessage(content=msg.content))
        elif msg.role == MessageRole.AI:
            lc.append(AIMessage(content=msg.content))
        elif msg.role == MessageRole.TOOL:
            lc.append(
                ToolMessage(
                    content=msg.content,
                    tool_call_id=msg.tool_call_id or "",
                    name=msg.name,
                )
            )
    return lc


def _from_lc_message(lc_msg: Any) -> Message:
    """Convert a LangChain message to ``core.types.Message``."""
    content = lc_msg.content
    text = content if isinstance(content, str) else str(content)
    return Message(role=MessageRole.AI, content=text)
