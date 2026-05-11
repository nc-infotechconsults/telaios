"""Pure-logic helpers for document extraction.

These functions are called both from the synchronous router (within a
request-scoped session) and from background job runners (with their own
session).  They do NOT interact with HTTP concerns at all.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from telaios.modules.documents.chunks.service import ChunkService
from telaios.utils.errors import NotFoundError


async def _get_chunks(session: AsyncSession, document_id_str: str) -> list[dict[str, Any]]:
    doc_id = uuid.UUID(document_id_str)
    chunks = await ChunkService(session).get_by_document(doc_id)
    if not chunks:
        raise NotFoundError("No chunks found for document")
    return chunks


async def analyse_document_chunks(session: AsyncSession, document_id_str: str) -> dict[str, Any]:
    from telaios.tools.builtin.documents.analysis import analyze_text, get_document_summary

    chunks = await _get_chunks(session, document_id_str)
    content = "\n".join(c["content"] for c in chunks)
    analysis = analyze_text(content)
    summary = get_document_summary(analysis)
    return {
        "document_id": document_id_str,
        "analysis": {
            "word_count": analysis.word_count,
            "page_count": analysis.page_count,
            "headings": [
                {"level": h.level, "text": h.text, "position": h.position}
                for h in analysis.headings
            ],
            "sections": [{"title": s.title, "level": s.level} for s in analysis.sections],
            "key_terms": analysis.key_terms,
        },
        "summary": summary,
    }


async def convert_document_chunks(
    session: AsyncSession, document_id_str: str, target_format: str
) -> dict[str, Any]:
    from telaios.tools.builtin.documents.conversion import convert_from_markdown

    chunks = await _get_chunks(session, document_id_str)
    content = "\n\n".join(c["content"] for c in chunks)
    result = await convert_from_markdown(content, target_format)
    return {
        "document_id": document_id_str,
        "format": target_format,
        "size_bytes": len(result),
        "content": result.decode("utf-8", errors="replace")[:5000],
    }


async def extract_chunks_structured(
    session: AsyncSession,
    document_id_str: str,
    schema: dict[str, Any],
    focus: str | None,
) -> dict[str, Any]:
    from telaios.modules.document_llm.service import extract_structured_from_chunks

    chunks = await _get_chunks(session, document_id_str)
    extracted = await extract_structured_from_chunks(chunks, schema, focus)
    return {"document_id": document_id_str, "extracted": extracted}


async def summarize_document_chunks(
    session: AsyncSession,
    document_id_str: str,
    level: str,
    focus: str | None,
) -> dict[str, Any]:
    from telaios.modules.document_llm.service import summarize_chunks

    chunks = await _get_chunks(session, document_id_str)
    summary = await summarize_chunks(chunks, level, focus)
    return {"document_id": document_id_str, "level": level, "summary": summary}


async def compare_two_documents(
    session: AsyncSession,
    document_id_str: str,
    other_document_id_str: str,
    mode: str,
) -> dict[str, Any]:
    import difflib

    chunks_a = await _get_chunks(session, document_id_str)
    chunks_b = await _get_chunks(session, other_document_id_str)
    content_a = "\n".join(c["content"] for c in chunks_a)
    content_b = "\n".join(c["content"] for c in chunks_b)
    diff = difflib.unified_diff(
        content_a.splitlines(keepends=True),
        content_b.splitlines(keepends=True),
        fromfile="Document A",
        tofile="Document B",
        lineterm="",
    )
    return {
        "document_a": document_id_str,
        "document_b": other_document_id_str,
        "mode": mode,
        "word_count_a": len(content_a.split()),
        "word_count_b": len(content_b.split()),
        "diff": "".join(diff)[:5000],
    }


__all__ = [
    "analyse_document_chunks",
    "compare_two_documents",
    "convert_document_chunks",
    "extract_chunks_structured",
    "summarize_document_chunks",
]
