"""
api/routers/health.py
---------------------
Health check endpoint.

Health API transport.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/health")


@router.get("")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})
