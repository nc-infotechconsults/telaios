"""Background job runners for enhanced document routes."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from telaios.infra.jobs import get_job_tracker

logger = logging.getLogger(__name__)


async def run_analysis_job(job_id: str, document_id: str) -> None:
    """Run analysis in background."""
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")

    try:
        from telaios.infra import data_client
        from telaios.tools.builtin.documents.analysis import (
            analyze_text,
            get_document_summary,
        )

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            await tracker.update_job(job_id, status="failed", error="No chunks found")
            return

        content = "\n".join(c["content"] for c in chunks)
        analysis = analyze_text(content)
        summary = get_document_summary(analysis)

        await tracker.update_job(
            job_id,
            status="completed",
            progress=100,
            result={
                "document_id": document_id,
                "analysis": {
                    "word_count": analysis.word_count,
                    "page_count": analysis.page_count,
                    "headings": [
                        {"level": h.level, "text": h.text}
                        for h in analysis.headings
                    ],
                    "key_terms": analysis.key_terms,
                },
                "summary": summary,
            },
        )
    except Exception as exc:
        logger.error("Analysis job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))


async def run_convert_job(job_id: str, document_id: str, target_format: str) -> None:
    """Run conversion in background."""
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")

    try:
        from telaios.infra import data_client
        from telaios.tools.builtin.documents.conversion import convert_from_markdown

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            await tracker.update_job(job_id, status="failed", error="No chunks found")
            return

        content = "\n\n".join(c["content"] for c in chunks)
        result = await convert_from_markdown(content, target_format)

        await tracker.update_job(
            job_id,
            status="completed",
            progress=100,
            result={
                "document_id": document_id,
                "format": target_format,
                "size_bytes": len(result),
                "content_preview": result.decode("utf-8", errors="replace")[:5000],
            },
        )
    except Exception as exc:
        logger.error("Convert job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))


async def run_extract_job(
    job_id: str,
    document_id: str,
    schema: Dict[str, Any],
    focus: Optional[str] = None,
) -> None:
    """Run extraction in background."""
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")

    try:
        from telaios.api.routers.documents_v2_llm import extract_structured_from_chunks
        from telaios.infra import data_client

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            await tracker.update_job(job_id, status="failed", error="No chunks found")
            return

        result = await extract_structured_from_chunks(chunks, schema, focus)
        await tracker.update_job(
            job_id,
            status="completed",
            progress=100,
            result={"document_id": document_id, "extracted": result},
        )
    except Exception as exc:
        logger.error("Extract job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))


async def run_summarize_job(
    job_id: str,
    document_id: str,
    level: str = "brief",
    focus: Optional[str] = None,
) -> None:
    """Run summarization in background."""
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")

    try:
        from telaios.api.routers.documents_v2_llm import summarize_chunks
        from telaios.infra import data_client

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            await tracker.update_job(job_id, status="failed", error="No chunks found")
            return

        summary = await summarize_chunks(chunks, level, focus)
        await tracker.update_job(
            job_id,
            status="completed",
            progress=100,
            result={"document_id": document_id, "level": level, "summary": summary},
        )
    except Exception as exc:
        logger.error("Summarize job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))
