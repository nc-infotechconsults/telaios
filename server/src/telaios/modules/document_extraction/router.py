"""Document extraction router.

Endpoints for synchronous and asynchronous LLM-powered document operations:
  POST /documents/{document_id}/analyze
  POST /documents/{document_id}/convert
  POST /documents/{document_id}/extract
  POST /documents/{document_id}/summarize
  POST /documents/{document_id}/compare
  POST /documents/{document_id}/analyze/async
  POST /documents/{document_id}/convert/async
  POST /documents/{document_id}/extract/async
  POST /documents/{document_id}/summarize/async
  GET  /document-jobs/{job_id}
  GET  /document-jobs
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.auth.project_access import check_project_membership
from telaios.db.session import get_session
from telaios.infra.jobs import get_job_tracker
from telaios.modules.document_extraction.schemas import (
    CompareRequest,
    ConvertRequest,
    ExtractRequest,
    SummarizeRequest,
)
from telaios.modules.document_extraction.service import (
    run_analysis_job,
    run_convert_job,
    run_extract_job,
    run_summarize_job,
)
from telaios.modules.document_extraction.service_helpers import (
    analyse_document_chunks,
    compare_two_documents,
    convert_document_chunks,
    extract_chunks_structured,
    summarize_document_chunks,
)
from telaios.modules.documents.repository import DocumentRepository
from telaios.utils.errors import NotFoundError

extraction_router = APIRouter(tags=["document-extraction"])
jobs_router = APIRouter(prefix="/document-jobs", tags=["document-jobs"])


# ─── Access helper ─────────────────────────────────────────────────────────────


async def _check_doc_access(
    document_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: AsyncSession,
    min_role: str = "viewer",
) -> None:
    repo = DocumentRepository(session)
    doc = await repo.find_with_deleted(document_id)
    if doc is None:
        raise NotFoundError("Document not found")
    await check_project_membership(doc.project_id, principal, session, min_role)


# ─── Synchronous endpoints ─────────────────────────────────────────────────────


@extraction_router.post("/documents/{document_id}/analyze")
async def analyze_document(
    document_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Get document structure analysis (headings, sections, key terms)."""
    await _check_doc_access(document_id, principal, session)
    return await analyse_document_chunks(session, str(document_id))


@extraction_router.post("/documents/{document_id}/convert")
async def convert_document(
    document_id: uuid.UUID,
    body: ConvertRequest,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Convert document to target format (markdown, html, pdf)."""
    await _check_doc_access(document_id, principal, session)
    return await convert_document_chunks(session, str(document_id), body.target_format)


@extraction_router.post("/documents/{document_id}/extract")
async def extract_structured_data(
    document_id: uuid.UUID,
    body: ExtractRequest,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Extract structured data from document using JSON Schema."""
    await _check_doc_access(document_id, principal, session)
    return await extract_chunks_structured(session, str(document_id), body.schema_, body.focus)


@extraction_router.post("/documents/{document_id}/summarize")
async def summarize_document(
    document_id: uuid.UUID,
    body: SummarizeRequest,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Generate a summary of the document."""
    await _check_doc_access(document_id, principal, session)
    return await summarize_document_chunks(session, str(document_id), body.level, body.focus)


@extraction_router.post("/documents/{document_id}/compare")
async def compare_documents(
    document_id: uuid.UUID,
    body: CompareRequest,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Compare this document with another."""
    await _check_doc_access(document_id, principal, session)
    return await compare_two_documents(session, str(document_id), body.other_document_id, body.mode)


# ─── Async (background) endpoints ─────────────────────────────────────────────


@extraction_router.post("/documents/{document_id}/analyze/async")
async def analyze_document_async(
    document_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Start async document analysis. Returns job ID."""
    await _check_doc_access(document_id, principal, session)
    tracker = get_job_tracker()
    job_id = tracker.create_job("analyze", str(document_id))
    background_tasks.add_task(run_analysis_job, job_id, str(document_id))
    return {"job_id": job_id, "status": "pending", "document_id": str(document_id)}


@extraction_router.post("/documents/{document_id}/convert/async")
async def convert_document_async(
    document_id: uuid.UUID,
    body: ConvertRequest,
    background_tasks: BackgroundTasks,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Start async document conversion. Returns job ID."""
    await _check_doc_access(document_id, principal, session)
    tracker = get_job_tracker()
    job_id = tracker.create_job("convert", str(document_id))
    background_tasks.add_task(run_convert_job, job_id, str(document_id), body.target_format)
    return {"job_id": job_id, "status": "pending", "document_id": str(document_id)}


@extraction_router.post("/documents/{document_id}/extract/async")
async def extract_structured_data_async(
    document_id: uuid.UUID,
    body: ExtractRequest,
    background_tasks: BackgroundTasks,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Start async structured data extraction. Returns job ID."""
    await _check_doc_access(document_id, principal, session)
    tracker = get_job_tracker()
    job_id = tracker.create_job("extract", str(document_id))
    background_tasks.add_task(run_extract_job, job_id, str(document_id), body.schema_, body.focus)
    return {"job_id": job_id, "status": "pending", "document_id": str(document_id)}


@extraction_router.post("/documents/{document_id}/summarize/async")
async def summarize_document_async(
    document_id: uuid.UUID,
    body: SummarizeRequest,
    background_tasks: BackgroundTasks,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Start async document summarization. Returns job ID."""
    await _check_doc_access(document_id, principal, session)
    tracker = get_job_tracker()
    job_id = tracker.create_job("summarize", str(document_id))
    background_tasks.add_task(run_summarize_job, job_id, str(document_id), body.level, body.focus)
    return {"job_id": job_id, "status": "pending", "document_id": str(document_id)}


# ─── Job status endpoints ──────────────────────────────────────────────────────


@jobs_router.get("/{job_id}")
async def get_job_status(job_id: str) -> dict[str, Any]:
    """Get status and result of an async document job."""
    tracker = get_job_tracker()
    job = tracker.get_job(job_id)
    if job is None:
        raise NotFoundError(f"Job {job_id} not found")
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


@jobs_router.get("")
async def list_jobs(
    document_id: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    """List async document jobs."""
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
