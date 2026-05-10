from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse

from telaios.config.settings import config

MAX_BODY_SIZE = config.MAX_BODY_SIZE * 1024 * 1024  # Convert MB to bytes

class LimitBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_BODY_SIZE:
            return JSONResponse(
                status_code=413, content={"error": "Request entity too large"}
            )
        return await call_next(request)
