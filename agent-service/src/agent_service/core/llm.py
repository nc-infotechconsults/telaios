from __future__ import annotations

from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel


def build_chat_model(
    provider: str,
    model: str,
    api_key: str,
    base_url: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    top_p: Optional[float] = None,
    frequency_penalty: Optional[float] = None,
    presence_penalty: Optional[float] = None,
) -> BaseChatModel:
    """Return a LangChain chat model for the given provider configuration.

    LLM generation parameters (temperature, max_tokens, top_p, frequency_penalty,
    presence_penalty) are forwarded when not None.  Callers may pass None for any
    parameter to let the provider use its default.
    """
    # Build only the kwargs that are explicitly set so we never accidentally
    # override provider defaults with None values.
    extra: dict = {}
    if temperature is not None:
        extra["temperature"] = temperature
    if max_tokens is not None:
        extra["max_tokens"] = max_tokens
    if top_p is not None:
        extra["top_p"] = top_p

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=model, api_key=api_key, **extra)  # type: ignore[arg-type]

    # openai provider and any OpenAI-compatible provider (ollama, vllm, lmstudio, etc.)
    from langchain_openai import ChatOpenAI

    if frequency_penalty is not None:
        extra["frequency_penalty"] = frequency_penalty
    if presence_penalty is not None:
        extra["presence_penalty"] = presence_penalty

    kwargs: dict = {"model": model, "api_key": api_key or "placeholder", **extra}
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)  # type: ignore[arg-type]
