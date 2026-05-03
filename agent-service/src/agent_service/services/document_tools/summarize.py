"""
agent_service/services/document_tools/summarize.py
---------------------------------------------------
Document summarization tool.
"""

from __future__ import annotations

from typing import Any

from core.types import ToolAnnotations, ToolInputSchema, ToolParameter
from tools.types import ExecutableTool


def make_summarize_document_tool(
    data_api_url: str = "http://localhost:3000",
    api_key: str = "",
) -> ExecutableTool:
    """
    Tool: summarize_document

    Generates a summary of a document at different levels of detail.
    """

    async def _summarize(
        document_id: str,
        level: str = "brief",
        focus: str = "",
        **_: Any,
    ) -> str:
        try:
            from agent_service.services import data_client
            from agent_service.config import config
            from agent_service.core.llm import build_chat_model
            from langchain_core.messages import HumanMessage, SystemMessage

            chunks = await data_client.get_document_chunks(document_id)
            if not chunks:
                return f"Error: no chunks found for document '{document_id}'."

            content = "\n".join(c["content"] for c in chunks)

            # Build summary prompt based on level
            level_prompts = {
                "brief": (
                    "Provide a brief summary (2-3 sentences) capturing the main point."
                ),
                "detailed": (
                    "Provide a detailed summary (1-2 paragraphs) covering all key points, "
                    "arguments, and conclusions."
                ),
                "executive": (
                    "Provide an executive summary with: "
                    "1) Main purpose, 2) Key findings, 3) Recommendations/next steps. "
                    "Use bullet points."
                ),
            }

            level_instruction = level_prompts.get(level, level_prompts["brief"])
            focus_instruction = f"\nFocus specifically on: {focus}" if focus else ""

            system_prompt = (
                f"Summarize the following document. {level_instruction}{focus_instruction}"
            )

            llm = build_chat_model(
                provider=config.LLM_PROVIDER,
                model=config.LLM_MODEL,
                api_key=config.LLM_API_KEY,
                base_url=config.LLM_BASE_URL,
            )
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"Document content:\n\n{content[:8000]}"),
            ]
            response = await llm.ainvoke(messages)

            return response.content

        except Exception as exc:
            return f"Error summarizing document: {exc}"

    return ExecutableTool(
        name="summarize_document",
        description=(
            "Generate a summary of a document. "
            "Levels: 'brief' (2-3 sentences), 'detailed' (1-2 paragraphs), "
            "'executive' (bullet points with purpose/findings/recommendations)."
        ),
        input_schema=ToolInputSchema(
            properties={
                "document_id": ToolParameter(
                    type="string",
                    description="ID of the document to summarize.",
                ),
                "level": ToolParameter(
                    type="string",
                    description="Summary detail level.",
                    enum=["brief", "detailed", "executive"],
                ),
                "focus": ToolParameter(
                    type="string",
                    description="Optional focus area for the summary.",
                ),
            },
            required=["document_id"],
        ),
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_summarize,
    )
