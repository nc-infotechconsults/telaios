"""
agent_service/api/documents_v2.py
----------------------------------
Enhanced document API endpoints.

Endpoints:
- POST /documents/{id}/analyze — Get document structure analysis
- POST /documents/{id}/convert — Convert to target format
- POST /documents/{id}/extract — Structured data extraction
- POST /documents/{id}/summarize — Generate summary
- POST /documents/{id}/compare — Compare with another document
- POST /documents/{id}/analyze/async — Async analysis (returns job ID)
- POST /documents/{id}/convert/async — Async conversion (returns job ID)
- POST /documents/{id}/extract/async — Async extraction (returns job ID)
- POST /documents/{id}/summarize/async — Async summarization (returns job ID)
- GET /jobs/{job_id} — Get job status and result
- GET /jobs — List jobs
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from agent_service.services.job_tracker import JobTracker, get_job_tracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents-v2"])


class ConvertRequest(BaseModel):
    target_format: str


class ExtractRequest(BaseModel):
    schema_: Dict[str, Any]
    focus: Optional[str] = None


class SummarizeRequest(BaseModel):
    level: str = "brief"
    focus: Optional[str] = None


class CompareRequest(BaseModel):
    other_document_id: str
    mode: str = "text"


@router.post("/{document_id}/analyze")
async def analyze_document(document_id: str) -> Dict[str, Any]:
    """Get document structure analysis (headings, sections, key terms)."""
    try:
        from agent_service.services import data_client
        from agent_service.services.document_analyzer import (
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
async def convert_document(
    document_id: str,
    body: ConvertRequest,
) -> Dict[str, Any]:
    """Convert document to target format (markdown, html, pdf)."""
    try:
        from agent_service.services import data_client
        from agent_service.services.document_converter import (
            convert_from_markdown,
        )

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
        import json
        from agent_service.services import data_client
        from agent_service.config import config
        from agent_service.core.llm import build_chat_model
        from langchain_core.messages import HumanMessage, SystemMessage

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            raise HTTPException(status_code=404, detail="No chunks found")

        content = "\n".join(c["content"] for c in chunks[:20])
        schema_str = json.dumps(body.schema_, indent=2)

        focus_instruction = f"Focus on: {body.focus}\n\n" if body.focus else ""
        system_prompt = (
            f"Extract structured data from the following document content "
            f"according to this JSON Schema:\n\n{schema_str}\n\n"
            f"{focus_instruction}"
            "Return ONLY valid JSON matching the schema."
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

        try:
            result = json.loads(response.content)
        except json.JSONDecodeError:
            result = {"raw": response.content}

        return {
            "document_id": document_id,
            "extracted": result,
        }
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
        from agent_service.services import data_client
        from agent_service.config import config
        from agent_service.core.llm import build_chat_model
        from langchain_core.messages import HumanMessage, SystemMessage

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            raise HTTPException(status_code=404, detail="No chunks found")

        content = "\n".join(c["content"] for c in chunks)

        level_prompts = {
            "brief": "Provide a brief summary (2-3 sentences).",
            "detailed": "Provide a detailed summary (1-2 paragraphs).",
            "executive": "Provide an executive summary with purpose, findings, and recommendations.",
        }

        level_instruction = level_prompts.get(body.level, level_prompts["brief"])
        focus_instruction = f"\nFocus on: {body.focus}" if body.focus else ""

        system_prompt = f"Summarize the following document. {level_instruction}{focus_instruction}"

        llm = build_chat_model(
            provider=config.LLM_PROVIDER,
            model=config.LLM_MODEL,
            api_key=config.LLM_API_KEY,
            base_url=config.LLM_BASE_URL,
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Document content:\n\n{content[:8000]}"),
        ]
        response = await llm.ainvoke(messages)

        return {
            "document_id": document_id,
            "level": body.level,
            "summary": response.content,
        }
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
        from agent_service.services import data_client

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


# ── Async Job Endpoints ─────────────────────────────────────────────────────────


@router.post("/{document_id}/analyze/async")
async def analyze_document_async(
    document_id: str,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """Start async document analysis. Returns job ID."""
    tracker = get_job_tracker()
    job_id = tracker.create_job("analyze", document_id)

    background_tasks.add_task(_run_analysis_job, job_id, document_id)
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

    background_tasks.add_task(_run_convert_job, job_id, document_id, body.target_format)
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

    background_tasks.add_task(
        _run_extract_job,
        job_id,
        document_id,
        body.schema_,
        body.focus,
    )
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

    background_tasks.add_task(
        _run_summarize_job,
        job_id,
        document_id,
        body.level,
        body.focus,
    )
    return {"job_id": job_id, "status": "pending", "document_id": document_id}


# ── Job Status Endpoints ──────────────────────────────────────────────────────


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


# ── Background Job Runners ────────────────────────────────────────────────────


async def _run_analysis_job(job_id: str, document_id: str) -> None:
    """Run analysis in background."""
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")

    try:
        from agent_service.services import data_client
        from agent_service.services.document_analyzer import (
            analyze_text,
            get_document_summary,
        )

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            await tracker.update_job(
                job_id, status="failed", error="No chunks found"
            )
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


async def _run_convert_job(
    job_id: str, document_id: str, target_format: str
) -> None:
    """Run conversion in background."""
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")

    try:
        from agent_service.services import data_client
        from agent_service.services.document_converter import convert_from_markdown

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            await tracker.update_job(
                job_id, status="failed", error="No chunks found"
            )
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


async def _run_extract_job(
    job_id: str,
    document_id: str,
    schema: Dict[str, Any],
    focus: Optional[str] = None,
) -> None:
    """Run extraction in background."""
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")

    try:
        import json
        from agent_service.services import data_client
        from agent_service.config import config
        from agent_service.core.llm import build_chat_model
        from langchain_core.messages import HumanMessage, SystemMessage

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            await tracker.update_job(
                job_id, status="failed", error="No chunks found"
            )
            return

        content = "\n".join(c["content"] for c in chunks[:20])
        schema_str = json.dumps(schema, indent=2)

        focus_instruction = f"Focus on: {focus}\n\n" if focus else ""
        system_prompt = (
            f"Extract structured data from the following document content "
            f"according to this JSON Schema:\n\n{schema_str}\n\n"
            f"{focus_instruction}"
            "Return ONLY valid JSON matching the schema."
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

        try:
            result = json.loads(response.content)
        except json.JSONDecodeError:
            result = {"raw": response.content}

        await tracker.update_job(
            job_id,
            status="completed",
            progress=100,
            result={"document_id": document_id, "extracted": result},
        )
    except Exception as exc:
        logger.error("Extract job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))


async def _run_summarize_job(
    job_id: str,
    document_id: str,
    level: str = "brief",
    focus: Optional[str] = None,
) -> None:
    """Run summarization in background."""
    tracker = get_job_tracker()
    await tracker.update_job(job_id, status="processing")

    try:
        from agent_service.services import data_client
        from agent_service.config import config
        from agent_service.core.llm import build_chat_model
        from langchain_core.messages import HumanMessage, SystemMessage

        chunks = await data_client.get_document_chunks(document_id)
        if not chunks:
            await tracker.update_job(
                job_id, status="failed", error="No chunks found"
            )
            return

        content = "\n".join(c["content"] for c in chunks)

        level_prompts = {
            "brief": "Provide a brief summary (2-3 sentences).",
            "detailed": "Provide a detailed summary (1-2 paragraphs).",
            "executive": "Provide an executive summary with purpose, findings, and recommendations.",
        }

        level_instruction = level_prompts.get(level, level_prompts["brief"])
        focus_instruction = f"\nFocus on: {focus}" if focus else ""

        system_prompt = f"Summarize the following document. {level_instruction}{focus_instruction}"

        llm = build_chat_model(
            provider=config.LLM_PROVIDER,
            model=config.LLM_MODEL,
            api_key=config.LLM_API_KEY,
            base_url=config.LLM_BASE_URL,
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Document content:\n\n{content[:8000]}"),
        ]
        response = await llm.ainvoke(messages)

        await tracker.update_job(
            job_id,
            status="completed",
            progress=100,
            result={
                "document_id": document_id,
                "level": level,
                "summary": response.content,
            },
        )
    except Exception as exc:
        logger.error("Summarize job %s failed: %s", job_id, exc)
        await tracker.update_job(job_id, status="failed", error=str(exc))
