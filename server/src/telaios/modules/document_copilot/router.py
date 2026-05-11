"""Document copilot router.

Endpoints for AI-powered operations on a single document:
  POST /documents/{document_id}/copilot/summarize
  POST /documents/{document_id}/copilot/ask
  POST /documents/{document_id}/copilot/extract
  POST /documents/{document_id}/copilot/chat
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from telaios.auth.dependencies import CurrentPrincipal
from telaios.auth.project_access import check_project_membership
from telaios.db.session import get_session
from telaios.modules.document_copilot.schemas import AskRequest, ChatRequest
from telaios.modules.document_copilot.service import (
    copilot_ask,
    copilot_chat,
    copilot_extract,
    copilot_summarize,
)
from telaios.modules.documents.repository import DocumentRepository
from telaios.utils.errors import NotFoundError

copilot_router = APIRouter(tags=["document-copilot"])


async def _check_doc_access(
    document_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: AsyncSession,
    min_role: str = "viewer",
) -> uuid.UUID:
    """Verify access and return project_id."""
    repo = DocumentRepository(session)
    doc = await repo.find_with_deleted(document_id)
    if doc is None:
        raise NotFoundError("Document not found")
    await check_project_membership(doc.project_id, principal, session, min_role)
    return doc.project_id


@copilot_router.post("/documents/{document_id}/copilot/summarize")
async def copilot_summarize_endpoint(
    document_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """AI-generated summary of a document."""
    project_id = await _check_doc_access(document_id, principal, session)
    return await copilot_summarize(session, project_id, document_id)


@copilot_router.post("/documents/{document_id}/copilot/ask")
async def copilot_ask_endpoint(
    document_id: uuid.UUID,
    body: AskRequest,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Answer a natural-language question about the document via RAG."""
    project_id = await _check_doc_access(document_id, principal, session)
    return await copilot_ask(session, project_id, document_id, body.question)


@copilot_router.post("/documents/{document_id}/copilot/extract")
async def copilot_extract_endpoint(
    document_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Extract entities, tables, and key-value pairs from the document."""
    project_id = await _check_doc_access(document_id, principal, session)
    return await copilot_extract(session, project_id, document_id)


@copilot_router.post("/documents/{document_id}/copilot/chat")
async def copilot_chat_endpoint(
    document_id: uuid.UUID,
    body: ChatRequest,
    principal: CurrentPrincipal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    """Single chat turn against the document."""
    project_id = await _check_doc_access(document_id, principal, session)
    return await copilot_chat(session, project_id, document_id, body.session_id, body.message)
