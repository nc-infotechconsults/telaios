from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent_service.api.deps import ApiKeyDep
from agent_service.services.document_processor import process_document

logger = logging.getLogger(__name__)

router = APIRouter()


class ProcessRequest(BaseModel):
    project_id: str


@router.post("/documents/{document_id}/process", status_code=202)
async def process_document_endpoint(document_id: str, body: ProcessRequest, _auth: ApiKeyDep) -> dict:
    """
    Trigger asynchronous document processing.

    Returns 202 Accepted immediately; the pipeline runs in the background.
    Pipeline: S3 download → text extraction → chunking → embedding → store.
    """
    if not body.project_id:
        raise HTTPException(status_code=400, detail="project_id is required")

    asyncio.create_task(process_document(document_id, body.project_id))
    return {"status": "accepted", "document_id": document_id}
