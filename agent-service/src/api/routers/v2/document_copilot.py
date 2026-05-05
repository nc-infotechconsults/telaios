"""
api/routers/v2/document_copilot.py
-----------------------------------
Document Copilot v2 API.

Document Copilot v2 API.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from domain.agents.document_assistant import chat

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/projects/{project_id}/documents/{document_id}",
    tags=["document-copilot-v2"],
)


class ChatRequest(BaseModel):
    session_id: str
    message: str


@router.post("/chat")
async def document_chat(
    project_id: str,
    document_id: str,
    body: ChatRequest,
) -> dict:
    """Send a message to the document copilot and receive a reply.

    The conversation is persisted by `session_id` so follow-up messages
    within the same session see the full prior history.
    """
    try:
        return await chat(
            project_id=project_id,
            document_id=document_id,
            session_id=body.session_id,
            message=body.message,
        )
    except RuntimeError as exc:
        # Graph not initialised — startup misconfiguration
        logger.error("Document copilot not ready: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("Document chat error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
