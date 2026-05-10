"""Application error hierarchy and FastAPI exception handlers.

Design:
  - All domain errors inherit from :class:`AppError`.
  - Each error carries an HTTP ``status_code``, a stable ``code`` (for clients
    to switch on), and a human-readable ``message``.
  - The :func:`install_exception_handlers` function registers a global handler
    that converts ``AppError`` and validation errors into a uniform JSON shape::

        {"error": {"code": "NOT_FOUND", "message": "...", "details": {...}}}
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from telaios.config.logging import get_logger

_logger = get_logger(__name__)


class AppError(Exception):
    """Base class for all domain errors raised by services."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "INTERNAL_ERROR"
    default_message: str = "Internal server error"

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message or self.default_message)
        self.message = message or self.default_message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details:
            payload["details"] = self.details
        return payload


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"
    default_message = "Resource not found"


class ValidationError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "VALIDATION_ERROR"
    default_message = "Validation failed"


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "UNAUTHORIZED"
    default_message = "Authentication required"


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"
    default_message = "Permission denied"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "CONFLICT"
    default_message = "Resource conflict"


class BadRequestError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "BAD_REQUEST"
    default_message = "Bad request"


class ExternalServiceError(AppError):
    status_code = status.HTTP_502_BAD_GATEWAY
    code = "EXTERNAL_SERVICE_ERROR"
    default_message = "External service failure"


# ─── Handlers ───────────────────────────────────────────────────────────────


def _envelope(
    *,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    _logger.warning(
        "app.error",
        path=request.url.path,
        method=request.method,
        code=exc.code,
        status=exc.status_code,
    )
    return JSONResponse(status_code=exc.status_code, content=_envelope(**exc.to_dict()))


async def _validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content=_envelope(
            code="VALIDATION_ERROR",
            message="Request validation failed",
            details={"errors": exc.errors()},
        ),
    )


async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_envelope(
            code=f"HTTP_{exc.status_code}",
            message=str(exc.detail) if exc.detail else "HTTP error",
        ),
    )


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    _logger.exception("unhandled.exception", path=request.url.path, method=request.method)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_envelope(code="INTERNAL_ERROR", message="Internal server error"),
    )


def install_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app."""
    app.add_exception_handler(AppError, _app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _unhandled_exception_handler)


__all__ = [
    "AppError",
    "BadRequestError",
    "ConflictError",
    "ExternalServiceError",
    "ForbiddenError",
    "NotFoundError",
    "UnauthorizedError",
    "ValidationError",
    "install_exception_handlers",
]
