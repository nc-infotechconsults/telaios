"""LLM provider catalogue endpoint.

GET /llm/providers  — returns a static list of supported LLM providers.
This is read-only metadata; no DB access required.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

llm_router = APIRouter(prefix="/llm", tags=["llm"])


class LlmProviderDefinition(BaseModel):
    id: str
    name: str
    type: str  # "cloud" | "onprem"
    models: list[str]
    needs_api_key: bool
    needs_base_url: bool
    openai_compat: bool


_PROVIDERS: list[LlmProviderDefinition] = [
    LlmProviderDefinition(
        id="openai",
        name="OpenAI",
        type="cloud",
        models=["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        needs_api_key=True,
        needs_base_url=False,
        openai_compat=True,
    ),
    LlmProviderDefinition(
        id="anthropic",
        name="Anthropic",
        type="cloud",
        models=[
            "claude-3-5-sonnet-20241022",
            "claude-3-haiku-20240307",
            "claude-3-opus-20240229",
        ],
        needs_api_key=True,
        needs_base_url=False,
        openai_compat=False,
    ),
    LlmProviderDefinition(
        id="ollama",
        name="Ollama (local)",
        type="onprem",
        models=["llama3", "llama3.1", "mistral", "codellama", "phi3"],
        needs_api_key=False,
        needs_base_url=True,
        openai_compat=True,
    ),
    LlmProviderDefinition(
        id="vllm",
        name="vLLM (self-hosted)",
        type="onprem",
        models=[],
        needs_api_key=False,
        needs_base_url=True,
        openai_compat=True,
    ),
    LlmProviderDefinition(
        id="lmstudio",
        name="LM Studio (local)",
        type="onprem",
        models=[],
        needs_api_key=False,
        needs_base_url=True,
        openai_compat=True,
    ),
]


@llm_router.get("/providers", response_model=list[LlmProviderDefinition])
async def list_llm_providers() -> list[LlmProviderDefinition]:
    """Return the catalogue of supported LLM providers."""
    return _PROVIDERS
