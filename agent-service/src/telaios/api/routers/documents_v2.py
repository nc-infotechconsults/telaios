"""Enhanced document API endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException

from telaios.api.routers.documents_v2_jobs import (
    run_analysis_job,
    run_convert_job,
    run_extract_job,
    run_summarize_job,
)
from telaios.api.routers.documents_v2_models import (
    CompareRequest,
    ConvertRequest,
    ExtractRequest,
    SummarizeRequest,
)
from telaios.infra.jobs import get_job_tracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents-v2"])


@router.post("/{document_id}/analyze")
async def analyze_document(document_id: str) -> Dict[str, Any]:
    """Get document structure analysis (headings, sections, key terms)."""
    try:
        from telaios.infra import data_client
        from telaios.tools.builtin.documents.analysis import (
            analyze_text,
            get_document_summary,
        )

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            raise HTTPException(status_code=404, detail="No chunks found")

        content = "\n".join(c["content"] for c in chunks)
        analysis = analyze_text(content)
        summary = get_document_summary(analysis)

        return {
            "document_id": document_id,
            "analysis": {
                "word_count": analysis.word_count,
                "page_count": analysis.page_count,
                "headings": [
                    {"level": h.level, "text": h.text, "position": h.position}
                    for h in analysis.headings
                ],
                "sections": [
                    {"title": s.title, "level": s.level}
                    for s in analysis.sections
                ],
                "key_terms": analysis.key_terms,
            },
            "summary": summary,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Document analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{document_id}/convert")
async def convert_document(document_id: str, body: ConvertRequest) -> Dict[str, Any]:
    """Convert document to target format (markdown, html, pdf)."""
    try:
        from telaios.infra import data_client
        from telaios.tools.builtin.documents.conversion import convert_from_markdown

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            raise HTTPException(status_code=404, detail="No chunks found")

        content = "\n\n".join(c["content"] for c in chunks)
        result = await convert_from_markdown(content, body.target_format)

        return {
            "document_id": document_id,
            "format": body.target_format,
            "size_bytes": len(result),
            "content": result.decode("utf-8", errors="replace")[:5000],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Document conversion failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{document_id}/extract")
async def extract_structured_data(
    document_id: str,
    body: ExtractRequest,
) -> Dict[str, Any]:
    """Extract structured data from document using JSON Schema."""
    try:
        from telaios.api.routers.documents_v2_llm import extract_structured_from_chunks
        from telaios.infra import data_client

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            raise HTTPException(status_code=404, detail="No chunks found")

        result = await extract_structured_from_chunks(chunks, body.schema_, body.focus)
        return {"document_id": document_id, "extracted": result}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Structured extraction failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{document_id}/summarize")
async def summarize_document(
    document_id: str,
    body: SummarizeRequest,
) -> Dict[str, Any]:
    """Generate a summary of the document."""
    try:
        from telaios.api.routers.documents_v2_llm import summarize_chunks
        from telaios.infra import data_client

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            raise HTTPException(status_code=404, detail="No chunks found")

        summary = await summarize_chunks(chunks, body.level, body.focus)
        return {"document_id": document_id, "level": body.level, "summary": summary}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Document summarization failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{document_id}/compare")
async def compare_documents(
    document_id: str,
    body: CompareRequest,
) -> Dict[str, Any]:
    """Compare this document with another."""
    try:
        import difflib
        from telaios.infra import data_client

        chunks_a = await data_client.get_document_chunks(document_id)
        chunks_b = await data_client.get_document_chunks(body.other_document_id)

        if not chunks_a:
            raise HTTPException(status_code=404, detail=f"No chunks for {document_id}")
        if not chunks_b:
            raise HTTPException(status_code=404, detail=f"No chunks for {body.other_document_id}")

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
            "document_a": document_id,
            "document_b": body.other_document_id,
            "mode": body.mode,
            "word_count_a": len(content_a.split()),
            "word_count_b": len(content_b.split()),
            "diff": "".join(diff)[:5000],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Document comparison failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{document_id}/analyze/async")
async def analyze_document_async(
    document_id: str,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """Start async document analysis. Returns job ID."""
    tracker = get_job_tracker()
    job_id = tracker.create_job("analyze", document_id)
    background_tasks.add_task(run_analysis_job, job_id, document_id)
    return {"job_id": job_id, "status": "pending", "document_id": document_id}


@router.post("/{document_id}/convert/async")
async def convert_document_async(
    document_id: str,
    body: ConvertRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """Start async document conversion. Returns job ID."""
    tracker = get_job_tracker()
    job_id = tracker.create_job("convert", document_id)
    background_tasks.add_task(run_convert_job, job_id, document_id, body.target_format)
    return {"job_id": job_id, "status": "pending", "document_id": document_id}


@router.post("/{document_id}/extract/async")
async def extract_structured_data_async(
    document_id: str,
    body: ExtractRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """Start async structured data extraction. Returns job ID."""
    tracker = get_job_tracker()
    job_id = tracker.create_job("extract", document_id)
    background_tasks.add_task(run_extract_job, job_id, document_id, body.schema_, body.focus)
    return {"job_id": job_id, "status": "pending", "document_id": document_id}


@router.post("/{document_id}/summarize/async")
async def summarize_document_async(
    document_id: str,
    body: SummarizeRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """Start async document summarization. Returns job ID."""
    tracker = get_job_tracker()
    job_id = tracker.create_job("summarize", document_id)
    background_tasks.add_task(run_summarize_job, job_id, document_id, body.level, body.focus)
    return {"job_id": job_id, "status": "pending", "document_id": document_id}


@router.get("/jobs/{job_id}", include_in_schema=False)
async def get_job_status(job_id: str) -> Dict[str, Any]:
    """Get status and result of an async job."""
    tracker = get_job_tracker()
    job = tracker.get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return {
        "job_id": job.id,
        "type": job.type,
        "status": job.status,
        "progress": job.progress,
        "document_id": job.document_id,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "result": job.result,
        "error": job.error,
    }


@router.get("/jobs", include_in_schema=False)
async def list_jobs(
    document_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """List async jobs with optional filtering."""
    tracker = get_job_tracker()
    jobs = tracker.list_jobs(document_id=document_id, status=status, limit=limit)

    return {
        "jobs": [
            {
                "job_id": j.id,
                "type": j.type,
                "status": j.status,
                "progress": j.progress,
                "document_id": j.document_id,
                "created_at": j.created_at,
            }
            for j in jobs
        ],
        "total": len(jobs),
    }
