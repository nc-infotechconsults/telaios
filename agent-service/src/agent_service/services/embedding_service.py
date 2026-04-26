from __future__ import annotations

import logging
from typing import Optional

from agent_service.config import config

logger = logging.getLogger(__name__)

_LOCAL_MODEL_DEFAULT = "BAAI/bge-small-en-v1.5"

_local_embeddings = None
_openai_embeddings = None
_voyage_embeddings = None


# ── Provider resolution ───────────────────────────────────────────────────────


def _resolve_provider() -> str:
    """
    Return the active embedding provider: "voyage", "openai", or "local".

    Resolution order:
    1. Explicit EMBEDDING_PROVIDER env var ("voyage" or "openai").
    2. If EMBEDDING_API_KEY is set and EMBEDDING_PROVIDER is empty, use "openai"
       (OpenAI-compatible endpoint including custom base URLs).
    3. If LLM_API_KEY is set and is not an Anthropic key, use "openai".
    4. Fall back to "local" (fastembed, no API key required).

    Anthropic LLM keys (sk-ant-*) are intentionally excluded from the OpenAI
    fallback — callers who want remote embeddings when using Anthropic as their
    LLM provider should set EMBEDDING_PROVIDER=voyage explicitly.
    """
    explicit = (config.EMBEDDING_PROVIDER or "").strip().lower()
    if explicit in ("voyage", "openai"):
        return explicit

    api_key = config.EMBEDDING_API_KEY or ""
    if api_key:
        return "openai"

    llm_key = config.LLM_API_KEY or ""
    if llm_key and not llm_key.startswith("sk-ant-"):
        return "openai"

    return "local"


# ── Lazy singletons ───────────────────────────────────────────────────────────


def _get_local_embeddings():
    global _local_embeddings
    if _local_embeddings is None:
        from fastembed import TextEmbedding

        _local_embeddings = TextEmbedding(model_name=_LOCAL_MODEL_DEFAULT)
    return _local_embeddings


def _get_openai_embeddings():
    global _openai_embeddings
    if _openai_embeddings is None:
        from langchain_openai import OpenAIEmbeddings

        api_key = config.EMBEDDING_API_KEY or config.LLM_API_KEY or None
        kwargs: dict = {"model": config.EMBEDDING_MODEL}
        if api_key:
            kwargs["api_key"] = api_key
        if config.EMBEDDING_BASE_URL:
            kwargs["base_url"] = config.EMBEDDING_BASE_URL
        _openai_embeddings = OpenAIEmbeddings(**kwargs)
    return _openai_embeddings


def _get_voyage_embeddings():
    """
    Return a Voyage AI embeddings client.

    Requires:
    - EMBEDDING_API_KEY set to a Voyage AI API key
    - EMBEDDING_MODEL set to a Voyage model name
      (e.g. "voyage-3-lite" → 512 dims, "voyage-3" → 1024 dims)

    The database vector column dimension (EMBEDDING_DIMENSION in data-api) must
    match the output dimension of the chosen Voyage model. Run the
    data-api dimension migration after changing models.
    """
    global _voyage_embeddings
    if _voyage_embeddings is None:
        from langchain_voyageai import VoyageAIEmbeddings

        api_key = config.EMBEDDING_API_KEY
        if not api_key:
            raise ValueError(
                "EMBEDDING_PROVIDER=voyage requires EMBEDDING_API_KEY to be set "
                "to a Voyage AI API key."
            )

        model = config.EMBEDDING_MODEL
        if model == _LOCAL_MODEL_DEFAULT:
            # User forgot to update EMBEDDING_MODEL; use a sensible Voyage default
            model = "voyage-3-lite"
            logger.warning(
                "EMBEDDING_PROVIDER=voyage but EMBEDDING_MODEL is still the local "
                "default (%s). Defaulting to 'voyage-3-lite' (512-dim). "
                "Set EMBEDDING_MODEL explicitly to suppress this warning.",
                _LOCAL_MODEL_DEFAULT,
            )

        _voyage_embeddings = VoyageAIEmbeddings(voyage_api_key=api_key, model=model)
    return _voyage_embeddings


# ── Public API ────────────────────────────────────────────────────────────────


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed an array of text strings.

    Provider selection (controlled by EMBEDDING_PROVIDER env var):
    - "voyage"  — Voyage AI (recommended when LLM_PROVIDER=anthropic).
                  Requires EMBEDDING_API_KEY (Voyage key) and a matching
                  EMBEDDING_DIMENSION in data-api.
    - "openai"  — OpenAI or any OpenAI-compatible endpoint.
                  Requires EMBEDDING_API_KEY or LLM_API_KEY.
    - ""        — Auto-detect: "openai" when a non-Anthropic key is available,
                  otherwise "local" fastembed (BAAI/bge-small-en-v1.5, 384-dim,
                  no API key required).
    """
    if not texts:
        return []

    provider = _resolve_provider()

    if provider == "voyage":
        model = _get_voyage_embeddings()
        return await model.aembed_documents(texts)

    if provider == "openai":
        model = _get_openai_embeddings()
        return await model.aembed_documents(texts)

    # Local fastembed (runs in a thread to avoid blocking the event loop)
    import asyncio

    def _embed_sync() -> list[list[float]]:
        local = _get_local_embeddings()
        results: list[list[float]] = []
        for embedding in local.embed(texts):
            results.append(embedding.tolist())
        return results

    return await asyncio.to_thread(_embed_sync)
