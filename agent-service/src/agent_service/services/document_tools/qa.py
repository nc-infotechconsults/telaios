"""
agent_service/services/document_tools/qa.py
--------------------------------------------
Document Q&A tool using local RAG over document chunks.
"""

from __future__ import annotations

from typing import Any

from core.types import ToolAnnotations, ToolInputSchema, ToolParameter
from tools.types import ExecutableTool


def make_ask_document_tool(
    data_api_url: str = "http://localhost:3000",
    api_key: str = "",
) -> ExecutableTool:
    """
    Tool: ask_document

    Answers questions about a specific document using RAG over its chunks.
    """

    async def _ask(
        document_id: str,
        question: str,
        top_k: int = 5,
        **_: Any,
    ) -> str:
        try:
            from agent_service.services import data_client
            from agent_service.config import config
            from agent_service.core.llm import build_chat_model
            from langchain_core.messages import HumanMessage, SystemMessage

            # Fetch document chunks
            chunks = await data_client.get_document_chunks(document_id)
            if not chunks:
                return f"Error: no chunks found for document '{document_id}'."

            # Simple semantic search (keyword overlap)
            question_words = set(question.lower().split())
            scored_chunks = []
            for chunk in chunks:
                content = chunk["content"]
                content_words = set(content.lower().split())
                overlap = len(question_words & content_words)
                if overlap > 0:
                    scored_chunks.append((chunk, overlap))

            scored_chunks.sort(key=lambda x: x[1], reverse=True)
            top_chunks = [c for c, _ in scored_chunks[:top_k]]

            if not top_chunks:
                # Fallback: use first chunks
                top_chunks = chunks[:top_k]

            # Build context
            context_parts = []
            for i, chunk in enumerate(top_chunks, 1):
                page = chunk.get("metadata", {}).get("page", "")
                page_info = f" (page {page})" if page else ""
                context_parts.append(f"[{i}]{page_info} {chunk['content']}")

            context = "\n\n".join(context_parts)

            # Generate answer
            system_prompt = (
                "Answer the following question using ONLY the provided document context. "
                "If the context does not contain enough information to answer, "
                "say so explicitly and state what information is missing. "
                "Cite the source chunk numbers in your answer (e.g., [1], [2])."
            )

            llm = build_chat_model(
                provider=config.LLM_PROVIDER,
                model=config.LLM_MODEL,
                api_key=config.LLM_API_KEY,
                base_url=config.LLM_BASE_URL,
            )
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(
                    content=f"Context:\n{context}\n\nQuestion: {question}"
                ),
            ]
            response = await llm.ainvoke(messages)

            return response.content

        except Exception as exc:
            return f"Error answering question: {exc}"

    return ExecutableTool(
        name="ask_document",
        description=(
            "Answer a question about a specific document using its content. "
            "Returns an answer with source citations."
        ),
        input_schema=ToolInputSchema(
            properties={
                "document_id": ToolParameter(
                    type="string",
                    description="ID of the document to query.",
                ),
                "question": ToolParameter(
                    type="string",
                    description="The question to answer.",
                ),
                "top_k": ToolParameter(
                    type="integer",
                    description="Number of chunks to retrieve for context.",
                    default=5,
                ),
            },
            required=["document_id", "question"],
        ),
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_ask,
    )
