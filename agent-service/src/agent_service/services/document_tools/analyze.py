"""
agent_service/services/document_tools/analyze.py
-------------------------------------------------
Document analysis tools: metadata extraction and comparison.
"""

from __future__ import annotations

import json
from typing import Any

from core.types import ToolAnnotations, ToolInputSchema, ToolParameter
from tools.types import ExecutableTool


def make_get_document_metadata_tool(
    data_api_url: str = "http://localhost:3000",
    api_key: str = "",
) -> ExecutableTool:
    """
    Tool: get_document_metadata

    Returns comprehensive metadata about a document.
    """

    async def _get_metadata(document_id: str, **_: Any) -> str:
        try:
            from agent_service.services import data_client

            doc = await data_client.get_document_by_id(document_id)
            if not doc:
                return f"Error: document '{document_id}' not found."

            chunks = await data_client.get_document_chunks(document_id)
            chunk_count = len(chunks) if chunks else 0

            # Calculate word count from chunks
            word_count = 0
            if chunks:
                word_count = sum(
                    len(c["content"].split()) for c in chunks
                )

            metadata = {
                "document_id": doc.get("id"),
                "title": doc.get("title"),
                "file_name": doc.get("file_name"),
                "mime_type": doc.get("mime_type"),
                "file_type": doc.get("file_type"),
                "status": doc.get("status"),
                "created_at": doc.get("created_at"),
                "updated_at": doc.get("updated_at"),
                "chunk_count": chunk_count,
                "word_count": word_count,
                "processing_error": doc.get("processing_error"),
            }

            return json.dumps(metadata, indent=2, default=str)

        except Exception as exc:
            return f"Error getting document metadata: {exc}"

    return ExecutableTool(
        name="get_document_metadata",
        description=(
            "Get comprehensive metadata about a document including title, "
            "file type, chunk count, word count, and processing status."
        ),
        input_schema=ToolInputSchema(
            properties={
                "document_id": ToolParameter(
                    type="string",
                    description="ID of the document.",
                ),
            },
            required=["document_id"],
        ),
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_get_metadata,
    )


def make_compare_documents_tool(
    data_api_url: str = "http://localhost:3000",
    api_key: str = "",
) -> ExecutableTool:
    """
    Tool: compare_documents

    Compares two documents and identifies differences.
    """

    async def _compare(
        document_id_a: str,
        document_id_b: str,
        mode: str = "text",
        **_: Any,
    ) -> str:
        try:
            from agent_service.services import data_client

            chunks_a = await data_client.get_document_chunks(document_id_a)
            chunks_b = await data_client.get_document_chunks(document_id_b)

            if not chunks_a:
                return f"Error: no chunks found for document '{document_id_a}'."
            if not chunks_b:
                return f"Error: no chunks found for document '{document_id_b}'."

            content_a = "\n".join(c["content"] for c in chunks_a)
            content_b = "\n".join(c["content"] for c in chunks_b)

            if mode == "text":
                # Line-by-line diff
                import difflib
                diff = difflib.unified_diff(
                    content_a.splitlines(keepends=True),
                    content_b.splitlines(keepends=True),
                    fromfile="Document A",
                    tofile="Document B",
                    lineterm="",
                )
                diff_text = "".join(diff)

                result = {
                    "mode": "text",
                    "document_a": document_id_a,
                    "document_b": document_id_b,
                    "word_count_a": len(content_a.split()),
                    "word_count_b": len(content_b.split()),
                    "diff": diff_text[:5000],  # Limit output
                }

            elif mode == "structural":
                # Compare structure (headings, sections)
                import re
                headings_a = re.findall(r'^(#{1,6})\s+(.+)$', content_a, re.MULTILINE)
                headings_b = re.findall(r'^(#{1,6})\s+(.+)$', content_b, re.MULTILINE)

                headings_a_set = {h[1].strip() for h in headings_a}
                headings_b_set = {h[1].strip() for h in headings_b}

                result = {
                    "mode": "structural",
                    "document_a": document_id_a,
                    "document_b": document_id_b,
                    "headings_only_in_a": list(headings_a_set - headings_b_set),
                    "headings_only_in_b": list(headings_b_set - headings_a_set),
                    "shared_headings": list(headings_a_set & headings_b_set),
                }

            else:
                return f"Error: unknown comparison mode '{mode}'. Use 'text' or 'structural'."

            return json.dumps(result, indent=2, default=str)

        except Exception as exc:
            return f"Error comparing documents: {exc}"

    return ExecutableTool(
        name="compare_documents",
        description=(
            "Compare two documents and identify differences. "
            "Modes: 'text' (line-by-line diff), 'structural' (heading comparison)."
        ),
        input_schema=ToolInputSchema(
            properties={
                "document_id_a": ToolParameter(
                    type="string",
                    description="ID of the first document.",
                ),
                "document_id_b": ToolParameter(
                    type="string",
                    description="ID of the second document.",
                ),
                "mode": ToolParameter(
                    type="string",
                    description="Comparison mode: 'text' or 'structural'.",
                    enum=["text", "structural"],
                ),
            },
            required=["document_id_a", "document_id_b"],
        ),
        annotations=ToolAnnotations(read_only=True, idempotent=True),
        coroutine=_compare,
    )
