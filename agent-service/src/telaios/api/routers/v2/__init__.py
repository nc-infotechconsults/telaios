"""
api/routers/v2/__init__.py
--------------------------
V2 API router package.
"""

from __future__ import annotations

from fastapi import APIRouter

from telaios.api.routers.v2.document_copilot import router as doc_copilot_v2_router
from telaios.api.routers.documents_v2 import router as documents_v2_router

router = APIRouter(prefix="/api/v2")
router.include_router(doc_copilot_v2_router)
router.include_router(documents_v2_router)
