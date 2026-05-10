"""LLM helpers for enhanced document routes."""

from __future__ import annotations

import json
from typing import Any

from telaios.core.factory import create_llm
from telaios.core.types import LLMConfig, Message, MessageRole
from telaios.infra.settings import config


def _llm_config() -> LLMConfig:
    return LLMConfig(
        provider=config.LLM_PROVIDER,
        model=config.LLM_MODEL,
        api_key=config.LLM_API_KEY,
        base_url=config.LLM_BASE_URL,
    )


async def extract_structured_from_chunks(
    chunks: list[dict[str, Any]],
    schema: dict[str, Any],
    focus: str | None = None,
) -> Any:
    """Extract structured data from document chunks using JSON Schema."""
    content = "\n".join(c["content"] for c in chunks[:20])
    schema_str = json.dumps(schema, indent=2)
    focus_instruction = f"Focus on: {focus}\n\n" if focus else ""
    system_prompt = (
        "Extract structured data from the following document content "
        f"according to this JSON Schema:\n\n{schema_str}\n\n"
        f"{focus_instruction}"
        "Return ONLY valid JSON matching the schema."
    )

    response = await create_llm(_llm_config()).invoke(
        [
            Message(role=MessageRole.SYSTEM, content=system_prompt),
            Message(role=MessageRole.HUMAN, content=f"Document content:\n\n{content[:5000]}"),
        ]
    )

    try:
        return json.loads(response.content)
    except json.JSONDecodeError:
        return {"raw": response.content}


async def summarize_chunks(
    chunks: list[dict[str, Any]],
    level: str = "brief",
    focus: str | None = None,
) -> str:
    """Generate a document summary from chunks."""
    content = "\n".join(c["content"] for c in chunks)
    level_prompts = {
        "brief": "Provide a brief summary (2-3 sentences).",
        "detailed": "Provide a detailed summary (1-2 paragraphs).",
        "executive": "Provide an executive summary with purpose, findings, and recommendations.",
    }

    level_instruction = level_prompts.get(level, level_prompts["brief"])
    focus_instruction = f"\nFocus on: {focus}" if focus else ""
    system_prompt = f"Summarize the following document. {level_instruction}{focus_instruction}"

    response = await create_llm(_llm_config()).invoke(
        [
            Message(role=MessageRole.SYSTEM, content=system_prompt),
            Message(role=MessageRole.HUMAN, content=f"Document content:\n\n{content[:8000]}"),
        ]
    )
    return response.content
