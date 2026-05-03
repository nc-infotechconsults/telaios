"""
agent_service/services/document_tools/split.py
----------------------------------------------
Document split operations.

Tools for splitting documents by pages, headings, or size:
- PDF split by pages
- Markdown split by headings
- Text split by chunk size
"""

from __future__ import annotations

import logging
from typing import Any

from agent_service.services.tools import tool

logger = logging.getLogger(__name__)


def split_document() -> Any:
    @tool(description="Split a document by pages, headings, or chunk size.")
    async def split_document(
        document_id: str,
        mode: str = "headings",
        max_pages: int = 10,
        max_words: int = 5000,
    ) -> dict[str, Any]:
        """
        Split a document into smaller parts.

        Parameters:
            document_id: Document to split.
            mode: Split mode — "pages" (PDF), "headings" (Markdown), "size" (by word count).
            max_pages: Maximum pages per split (for PDF).
            max_words: Maximum words per split (for text/Markdown).

        Returns:
            parts: List of split parts with content and metadata.
            total_parts: Number of parts.
            mode: Split mode used.
        """
        try:
            from agent_service.services import data_client
            from agent_service.services.chunkers import SemanticChunker, PageChunker

            # Fetch document
            doc = await data_client.get_document_by_id(document_id)
            chunks = await data_client.get_document_chunks(document_id)
            content = "\n".join(c["content"] for c in chunks)

            mime = doc.get("mime_type", "").lower()

            if "pdf" in mime and mode == "pages":
                return await _split_pdf_by_pages(content, max_pages)
            elif mode == "headings":
                return await _split_by_headings(content, max_words)
            else:
                return await _split_by_size(content, max_words)

        except Exception as exc:
            logger.error("Document split failed: %s", exc)
            return {"error": str(exc)}

    return split_document


async def _split_pdf_by_pages(content: str, max_pages: int) -> dict[str, Any]:
    """Split PDF content by page markers."""
    import re

    # Find page markers
    page_markers = list(re.finditer(r"<!--\s*Page\s*(\d+)\s*-->", content))

    if not page_markers:
        return {
            "parts": [{"content": content, "start_page": 1, "end_page": 1}],
            "total_parts": 1,
            "mode": "pages",
        }

    parts: list[dict[str, Any]] = []
    current_part_pages: list[str] = []
    current_start = 1

    for i, marker in enumerate(page_markers):
        page_num = int(marker.group(1))
        start = marker.start()
        end = page_markers[i + 1].start() if i + 1 < len(page_markers) else len(content)
        page_text = content[start:end].strip()

        current_part_pages.append(page_text)

        # Emit when we hit max_pages or last page
        if len(current_part_pages) >= max_pages or i == len(page_markers) - 1:
            parts.append(
                {
                    "content": "\n\n".join(current_part_pages),
                    "start_page": current_start,
                    "end_page": page_num,
                    "page_count": len(current_part_pages),
                }
            )
            current_part_pages = []
            current_start = page_num + 1

    return {
        "parts": parts,
        "total_parts": len(parts),
        "mode": "pages",
    }


async def _split_by_headings(content: str, max_words: int) -> dict[str, Any]:
    """Split Markdown/content by headings with size limit."""
    import re

    # Find headings
    heading_re = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
    matches = list(heading_re.finditer(content))

    if not matches:
        return await _split_by_size(content, max_words)

    parts: list[dict[str, Any]] = []
    current_content: list[str] = []
    current_words = 0
    current_title = "Introduction"
    current_level = 0

    def emit_part():
        if current_content:
            text = "\n\n".join(current_content)
            parts.append(
                {
                    "content": text,
                    "title": current_title,
                    "heading_level": current_level,
                    "word_count": len(text.split()),
                }
            )

    for i, match in enumerate(matches):
        level = len(match.group(1))
        title = match.group(2).strip()

        # Get section content
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        section_text = content[start:end].strip()
        section_words = len(section_text.split())

        # If adding this section exceeds max_words, emit current part first
        if current_words + section_words > max_words and current_content:
            emit_part()
            current_content = [section_text]
            current_words = section_words
            current_title = title
            current_level = level
        else:
            current_content.append(section_text)
            current_words += section_words
            # Use first heading as title
            if len(current_content) == 1:
                current_title = title
                current_level = level

    # Emit final part
    emit_part()

    return {
        "parts": parts,
        "total_parts": len(parts),
        "mode": "headings",
    }


async def _split_by_size(content: str, max_words: int) -> dict[str, Any]:
    """Split content by word count."""
    words = content.split()
    parts: list[dict[str, Any]] = []

    start = 0
    while start < len(words):
        end = min(start + max_words, len(words))
        chunk_words = words[start:end]
        chunk_text = " ".join(chunk_words)

        parts.append(
            {
                "content": chunk_text,
                "word_count": len(chunk_words),
                "start_word": start,
                "end_word": end,
            }
        )

        start = end

    return {
        "parts": parts,
        "total_parts": len(parts),
        "mode": "size",
    }
