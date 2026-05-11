"""Background job runners for document extraction operations.

These are called via FastAPI BackgroundTasks.  Each function creates its
own DB session (from the process-wide session maker) so it can run after
the HTTP response has been sent.
"""

from __future__ import annotations

import logging
from typing import Any

from telaios.db.session import get_sessionmaker
from telaios.infra.jobs import get_job_tracker

logger = logging.getLogger(__name__)


async def run_analysis_job(job_id: str, document_id_str: str) -> None:
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")
    try:
        from telaios.modules.document_extraction.service_helpers import analyse_document_chunks

        sm = get_sessionmaker()
        async with sm() as session:
            result = await analyse_document_chunks(session, document_id_str)

        await tracker.update_job(job_id, status="completed", progress=100, result=result)
    except Exception as exc:
        logger.error("Analysis job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))


async def run_convert_job(job_id: str, document_id_str: str, target_format: str) -> None:
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")
    try:
        from telaios.modules.document_extraction.service_helpers import convert_document_chunks

        sm = get_sessionmaker()
        async with sm() as session:
            result = await convert_document_chunks(session, document_id_str, target_format)

        await tracker.update_job(job_id, status="completed", progress=100, result=result)
    except Exception as exc:
        logger.error("Convert job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))


async def run_extract_job(
    job_id: str,
    document_id_str: str,
    schema: dict[str, Any],
    focus: str | None = None,
) -> None:
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")
    try:
        from telaios.modules.document_extraction.service_helpers import extract_chunks_structured

        sm = get_sessionmaker()
        async with sm() as session:
            result = await extract_chunks_structured(session, document_id_str, schema, focus)

        await tracker.update_job(job_id, status="completed", progress=100, result=result)
    except Exception as exc:
        logger.error("Extract job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))


async def run_summarize_job(
    job_id: str,
    document_id_str: str,
    level: str = "brief",
    focus: str | None = None,
) -> None:
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")
    try:
        from telaios.modules.document_extraction.service_helpers import summarize_document_chunks

        sm = get_sessionmaker()
        async with sm() as session:
            result = await summarize_document_chunks(session, document_id_str, level, focus)

        await tracker.update_job(job_id, status="completed", progress=100, result=result)
    except Exception as exc:
        logger.error("Summarize job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))


__all__ = [
    "run_analysis_job",
    "run_convert_job",
    "run_extract_job",
    "run_summarize_job",
]
