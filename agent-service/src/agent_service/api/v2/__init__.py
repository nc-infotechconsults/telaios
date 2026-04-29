from __future__ import annotations

from fastapi import APIRouter

from agent_service.api.v2.document_copilot import router as doc_copilot_v2_router

router = APIRouter(prefix="/api/v2")
router.include_router(doc_copilot_v2_router)
