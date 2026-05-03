"""
agent_service/services/document_tools/extract.py
-------------------------------------------------
Document extraction and search tools.
"""

from __future__ import annotations

import json
from typing import Any

from core.types import ToolAnnotations, ToolInputSchema, ToolParameter
from tools.types import ExecutableTool


def make_extract_structured_data_tool(
    data_api_url: str = "http://localhost:3000",
    api_key: str = "",
) -> ExecutableTool:
    """
    Tool: extract_structured_data

    Extracts structured data from a document using an LLM with a JSON Schema.
    """

    async def _extract(
        document_id: str,
        schema: str,
        focus: str = "",
        **_: Any,
    ) -> str:
        try:
            from agent_service.services import data_client
            from agent_service.config import config
            from agent_service.core.llm import build_chat_model
            from langchain_core.messages import HumanMessage, SystemMessage

            # Fetch document content
            doc = await data_client.get_document_by_id(document_id)
            if not doc:
                return f"Error: document '{document_id}' not found."

            chunks = await data_client.get_document_chunks(document_id)
            if not chunks:
                return f"Error: no chunks found for document '{document_id}'."

            content = "\n".join(c["content"] for c in chunks[:20])

            # Build extraction prompt
            focus_instruction = f"Focus on: {focus}\n\n" if focus else ""
            system_prompt = (
                f"Extract structured data from the following document content "
                f"according to this JSON Schema:\n\n{schema}\n\n"
                f"{focus_instruction}"
                "Return ONLY valid JSON matching the schema. "
                "Do not include any explanation or markdown formatting."
            )

            llm = build_chat_model(
                provider=config.LLM_PROVIDER,
                model=config.LLM_MODEL,
                api_key=config.LLM_API_KEY,
                base_url=config.LLM_BASE_URL,
            )
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"Document content:\n\n{content[:5000]}"),
            ]
            response = await llm.ainvoke(messages)

            # Try to parse JSON
            try:
                result = json.loads(response.content)
                return json.dumps(result, indent=2)
            except json.JSONDecodeError:
                return f"Extraction result (not valid JSON):\n{response.content}"

        except Exception as exc:
            return f"Error extracting structured data: {exc}"

    return ExecutableTool(
        name="extract_structured_data",
        description=(
            "Extract structured data from a document using a JSON Schema. "
            "Returns JSON matching the provided schema."
        ),
        input_schema=ToolInputSchema(
            properties={
                "document_id": ToolParameter(
                    type="string",
                    description="ID of the document to extract from.",
                ),
                "schema": ToolParameter(
                    type="string",
                    description="JSON Schema defining the structure to extract.",
                ),
                "focus": ToolParameter(
                    type="string",
                    description="Optional focus area for extraction.",
                ),
            },
            required=["document_id", "schema"],
        ),
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_extract,
    )


def make_search_document_tool(
    data_api_url: str = "http://localhost:3000",
    api_key: str = "",
) -> ExecutableTool:
    """
    Tool: search_document

    Searches within a document for specific terms or patterns.
    """

    async def _search(
        document_id: str,
        query: str,
        mode: str = "text",
        context_size: int = 200,
        **_: Any,
    ) -> str:
        try:
            from agent_service.services import data_client

            chunks = await data_client.get_document_chunks(document_id)
            if not chunks:
                return f"Error: no chunks found for document '{document_id}'."

            matches = []
            query_lower = query.lower()

            for chunk in chunks:
                content = chunk["content"]
                content_lower = content.lower()
                found = False

                if mode == "text":
                    found = query_lower in content_lower
                elif mode == "regex":
                    import re
                    found = bool(re.search(query, content, re.IGNORECASE))
                elif mode == "semantic":
                    # Simple keyword overlap as fallback
                    query_words = set(query_lower.split())
                    content_words = set(content_lower.split())
                    overlap = len(query_words & content_words)
                    found = overlap >= max(1, len(query_words) // 2)

                if found:
                    # Find the exact match location and extract context
                    idx = content_lower.find(query_lower) if mode == "text" else 0
                    start = max(0, idx - context_size // 2)
                    end = min(len(content), idx + len(query) + context_size // 2)
                    context = content[start:end]

                    matches.append({
                        "chunk_index": chunk.get("chunk_index", 0),
                        "context": context,
                        "page": chunk.get("metadata", {}).get("page"),
                    })

            if not matches:
                return f"No matches found for '{query}' in document '{document_id}'."

            result = {
                "document_id": document_id,
                "query": query,
                "mode": mode,
                "total_matches": len(matches),
                "matches": matches[:10],  # Limit to first 10
            }
            return json.dumps(result, indent=2)

        except Exception as exc:
            return f"Error searching document: {exc}"

    return ExecutableTool(
        name="search_document",
        description=(
            "Search within a document for specific terms or patterns. "
            "Modes: 'text' (exact match), 'regex' (pattern), 'semantic' (keyword overlap)."
        ),
        input_schema=ToolInputSchema(
            properties={
                "document_id": ToolParameter(
                    type="string",
                    description="ID of the document to search.",
                ),
                "query": ToolParameter(
                    type="string",
                    description="Search query or pattern.",
                ),
                "mode": ToolParameter(
                    type="string",
                    description="Search mode: 'text', 'regex', or 'semantic'.",
                    enum=["text", "regex", "semantic"],
                ),
                "context_size": ToolParameter(
                    type="integer",
                    description="Characters of context around each match.",
                    default=200,
                ),
            },
            required=["document_id", "query"],
        ),
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_search,
    )
