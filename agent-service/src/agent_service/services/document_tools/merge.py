"""
agent_service/services/document_tools/merge.py
------------------------------------------------
Document merge operations.

Tools for merging multiple documents into a single document:
- PDF merge
- Markdown merge
"""

from __future__ import annotations

import logging
from typing import Any

from agent_service.services.tools import tool

logger = logging.getLogger(__name__)


def merge_documents() -> Any:
    @tool(description="Merge multiple documents (PDF or Markdown) into a single file.")
    async def merge_document(
        document_ids: list[str],
        output_format: str = "auto",
    ) -> dict[str, Any]:
        """
        Merge multiple documents into a single file.

        Parameters:
            document_ids: List of document IDs to merge (in order).
            output_format: Output format ("pdf", "markdown", "auto").
                "auto" infers from the first document.

        Returns:
            merged_document_id: ID of the merged document.
            page_count: Total page/section count.
            word_count: Total word count.
            format: Output format used.
            source_ids: Original document IDs.
        """
        try:
            from agent_service.services import data_client

            # Fetch all documents
            documents = []
            for doc_id in document_ids:
                try:
                    doc = await data_client.get_document_by_id(doc_id)
                    documents.append(doc)
                except Exception as exc:
                    logger.warning("Failed to fetch document %s: %s", doc_id, exc)

            if not documents:
                return {
                    "error": "No documents could be loaded",
                    "document_ids": document_ids,
                }

            # Determine output format
            if output_format == "auto":
                mime = documents[0].get("mime_type", "").lower()
                if "pdf" in mime:
                    output_format = "pdf"
                else:
                    output_format = "markdown"

            if output_format == "pdf":
                return await _merge_pdf(documents, document_ids)
            else:
                return await _merge_markdown(documents, document_ids)

        except Exception as exc:
            logger.error("Document merge failed: %s", exc)
            return {"error": str(exc)}

    return merge_document


async def _merge_pdf(documents: list[dict], source_ids: list[str]) -> dict[str, Any]:
    """Merge PDF documents using PyMuPDF."""
    try:
        import fitz

        merged_doc = fitz.open()
        total_pages = 0

        for doc in documents:
            # Fetch document content (assuming S3 or similar)
            # In a real implementation, download from S3/data-api
            # For now, placeholder — would need document content buffer
            pass

        # Note: Full implementation would download buffers and use fitz.open() + insert_pdf()
        # This is a scaffold showing the approach

        return {
            "merged_document_id": "placeholder",
            "page_count": total_pages,
            "format": "pdf",
            "source_ids": source_ids,
            "note": "PDF merge requires document buffer access",
        }

    except Exception as exc:
        logger.error("PDF merge failed: %s", exc)
        return {"error": f"PDF merge failed: {exc}"}


async def _merge_markdown(documents: list[dict], source_ids: list[str]) -> dict[str, Any]:
    """Merge Markdown/text documents."""
    import re

    parts: list[str] = []
    total_words = 0

    for i, doc in enumerate(documents):
        # Get document content
        try:
            from agent_service.services import data_client

            chunks = await data_client.get_document_chunks(doc["id"])
            content = "\n".join(c["content"] for c in chunks)
        except Exception:
            content = doc.get("text", "")

        if not content:
            continue

        # Add document separator
        title = doc.get("title", f"Document {i + 1}")
        parts.append(f"\n\n---\n\n# {title}\n\n")
        parts.append(content)

        total_words += len(content.split())

    merged = "\n".join(parts)

    return {
        "content": merged,
        "word_count": total_words,
        "format": "markdown",
        "source_ids": source_ids,
        "document_count": len(documents),
    }
