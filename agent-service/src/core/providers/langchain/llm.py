"""
src/core/providers/langchain/llm.py
------------------------------------
LangChain ``BaseChatModel`` factory.

This module owns the single responsibility of turning an ``LLMConfig`` into a
LangChain chat model.  It is shared by ``LangChainAgent`` and
``LangChainSimpleRAG`` so neither needs to duplicate the provider-switching
logic.

All ``langchain*`` imports are **deferred** (inside the function body) so that
this module can be imported without LangChain installed.

Source:
    BaseChatModel: https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/language_models/chat_models.py
"""

from __future__ import annotations

from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from core.types import LLMConfig


def build_llm(cfg: LLMConfig) -> BaseChatModel:
    """
    Instantiate a LangChain ``BaseChatModel`` from an ``LLMConfig``.

    Supported providers:
    - ``"anthropic"``  → ``ChatAnthropic``  (langchain-anthropic)
    - anything else    → ``ChatOpenAI``     (langchain-openai; covers OpenAI,
                                             Ollama, vLLM, LM Studio, …)

    Source:
        https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/language_models/chat_models.py
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
        from langchain_anthropic import ChatAnthropic  # noqa: PLC0415
        return ChatAnthropic(**extra)  # type: ignore[arg-type]

    # OpenAI and OpenAI-compatible providers (Ollama, vLLM, LM Studio, …)
    from langchain_openai import ChatOpenAI  # noqa: PLC0415

    # frequency_penalty / presence_penalty are OpenAI-only — not forwarded to Anthropic
    if cfg.frequency_penalty is not None:
        extra["frequency_penalty"] = cfg.frequency_penalty
    if cfg.presence_penalty is not None:
        extra["presence_penalty"] = cfg.presence_penalty

    return ChatOpenAI(**extra)  # type: ignore[arg-type]
