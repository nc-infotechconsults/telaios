"""
api/routers/document_copilot.py
-------------------------------
Document Copilot v1 API — AI-powered document operations.

Document Copilot API for document operations.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from telaios.domain.agents.document_assistant import DocumentCopilotConfig, ask, extract, summarize
from telaios.infra.settings import config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/documents/{document_id}/copilot", tags=["document-copilot"])


def _default_cfg() -> DocumentCopilotConfig:
    """Build a DocumentCopilotConfig from environment/settings."""
    return DocumentCopilotConfig(
        llm_provider=config.LLM_PROVIDER,
        llm_model=config.LLM_MODEL,
        llm_api_key=config.LLM_API_KEY,
        llm_base_url=config.LLM_BASE_URL,
    )


class AskRequest(BaseModel):
    question: str


@router.post("/summarize")
async def copilot_summarize(project_id: str, document_id: str) -> dict:
    """
    Generate a summary of the document.

    Returns: { summary, key_points, word_count }
    """
    try:
        return await summarize(project_id, document_id, _default_cfg())
    except Exception as exc:
        logger.exception("Summarize failed for doc %s", document_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/ask")
async def copilot_ask(project_id: str, document_id: str, body: AskRequest) -> dict:
    """
    Answer a question about the document using RAG.

    Returns: { answer, confidence, sources }
    """
    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="question is required")
    try:
        return await ask(project_id, document_id, body.question.strip(), _default_cfg())
    except Exception as exc:
        logger.exception("Ask failed for doc %s", document_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/extract")
async def copilot_extract(project_id: str, document_id: str) -> dict:
    """
    Extract structured data (entities, tables, key-values) from the document.

    Returns: { entities, tables, key_values }
    """
    try:
        return await extract(project_id, document_id, _default_cfg())
    except Exception as exc:
        logger.exception("Extract failed for doc %s", document_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
