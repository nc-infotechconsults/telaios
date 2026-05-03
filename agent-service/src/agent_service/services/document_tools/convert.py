"""
agent_service/services/document_tools/convert.py
------------------------------------------------
Document conversion agent tool.

Wraps document_converter.py service as agent-callable tool.
"""

from __future__ import annotations

import logging
from typing import Any

from agent_service.services.tools import tool

logger = logging.getLogger(__name__)


def make_convert_document_tool() -> Any:
    @tool(description="Convert document to another format (markdown, html, pdf).")
    async def convert_document(
        document_id: str,
        target_format: str = "markdown",
    ) -> dict[str, Any]:
        """
        Convert document to target format.

        Parameters:
            document_id: Document ID to convert.
            target_format: Target format — "markdown", "html", "pdf".

        Returns:
            document_id: Original document ID.
            target_format: Output format.
            content: Converted content (text for markdown/html, base64 for pdf).
            size_bytes: Output size.
        """
        try:
            from agent_service.services import data_client
            from agent_service.services.document_converter import (
                convert_from_markdown,
                convert_to_markdown,
            )

            chunks = await data_client.get_document_chunks(document_id)
            if not chunks:
                return {"error": "No chunks found", "document_id": document_id}

            content = "\n\n".join(c["content"] for c in chunks)
            target = target_format.lower()

            if target in ("md", "markdown"):
                return {
                    "document_id": document_id,
                    "target_format": "markdown",
                    "content": content,
                    "size_bytes": len(content.encode()),
                }

            if target == "html":
                result = await convert_from_markdown(content, "html")
                text = result.decode("utf-8", errors="replace")
                return {
                    "document_id": document_id,
                    "target_format": "html",
                    "content": text,
                    "size_bytes": len(result),
                }

            if target == "pdf":
                result = await convert_from_markdown(content, "pdf")
                import base64

                return {
                    "document_id": document_id,
                    "target_format": "pdf",
                    "content": base64.b64encode(result).decode(),
                    "size_bytes": len(result),
                }

            return {
                "error": f"Unsupported target format: {target_format}",
                "supported": ["markdown", "html", "pdf"],
            }

        except Exception as exc:
            logger.error("Document conversion failed: %s", exc)
            return {"error": str(exc), "document_id": document_id}

    return convert_document
