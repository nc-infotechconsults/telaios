from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from agent_service.api.deps import ApiKeyDep

router = APIRouter(prefix="/health")


@router.get("")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})