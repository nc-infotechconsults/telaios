"""
api/routers/health.py
---------------------
Health check endpoint.

Health API transport.
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from telaios.client.redis import client as redis_client

router = APIRouter(prefix="/health")


@router.get("")
async def health() -> JSONResponse:
    return JSONResponse({"api": "up", "redis_connected": redis_client.connected })
