from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent_service.services.execution_service import start_execution

logger = logging.getLogger(__name__)

router = APIRouter()


class ResumeRequest(BaseModel):
    project_id: str


@router.post("/plans/{plan_id}/resume", status_code=202)
async def resume_plan(plan_id: str, body: ResumeRequest) -> dict:
    """
    Resume / start execution for a confirmed plan.

    Returns 202 Accepted immediately; the scheduler runs in the background.
    """
    if not body.project_id:
        raise HTTPException(status_code=400, detail="project_id is required")

    asyncio.create_task(start_execution(body.project_id, plan_id))
    return {"status": "accepted", "plan_id": plan_id}
