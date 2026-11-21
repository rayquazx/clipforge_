"""
ClipForge API — Standardized Error Handling per Phase 4 API Contract.
"""

from __future__ import annotations

from typing import Any, Optional
from fastapi import Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(StarletteHTTPException):
    """Base application exception following Phase 4 error conventions."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[dict[str, Any]] = None,
    ):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.details is not None:
            data["details"] = self.details
        return {
            "error": data,
            "detail": self.message,
        }


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found", details: Optional[dict[str, Any]] = None):
        super().__init__(code="not_found", message=message, status_code=status.HTTP_404_NOT_FOUND, details=details)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Access denied", details: Optional[dict[str, Any]] = None):
        super().__init__(code="forbidden", message=message, status_code=status.HTTP_403_FORBIDDEN, details=details)


class ValidationError(AppError):
    def __init__(self, message: str = "Validation failed", details: Optional[dict[str, Any]] = None):
        super().__init__(code="validation_error", message=message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, details=details)


class VersionConflictError(AppError):
    def __init__(self, message: str = "Version conflict", current_clip: Optional[dict[str, Any]] = None):
        details = {"current_clip": current_clip} if current_clip is not None else {}
        super().__init__(
            code="version_conflict",
            message=message,
            status_code=status.HTTP_409_CONFLICT,
            details=details,
        )


class SourceUnavailableError(AppError):
    def __init__(self, message: str = "Source video unavailable", details: Optional[dict[str, Any]] = None):
        super().__init__(code="source_unavailable", message=message, status_code=status.HTTP_502_BAD_GATEWAY, details=details)


class RenderFailedError(AppError):
    def __init__(self, message: str = "Video rendering failed", details: Optional[dict[str, Any]] = None):
        super().__init__(code="render_failed", message=message, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, details=details)


class RateLimitedError(AppError):
    def __init__(self, message: str = "Rate limit exceeded", details: Optional[dict[str, Any]] = None):
        super().__init__(code="rate_limited", message=message, status_code=status.HTTP_429_TOO_MANY_REQUESTS, details=details)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle custom AppError exceptions."""
    return JSONResponse(status_code=exc.status_code, content=jsonable_encoder(exc.to_dict()))


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle Pydantic validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "validation_error",
                "message": "Validation error in request parameters or body.",
                "details": {"errors": exc.errors()},
            }
        },
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Map standard HTTP exceptions to the contract format."""
    if isinstance(exc, AppError):
        return JSONResponse(status_code=exc.status_code, content=exc.to_dict())

    code_map = {
        400: "validation_error",
        401: "forbidden",
        403: "forbidden",
        404: "not_found",
        409: "version_conflict",
        422: "validation_error",
        429: "rate_limited",
        502: "source_unavailable",
        503: "source_unavailable",
    }
    code = code_map.get(exc.status_code, "server_error")
    message = str(exc.detail) if exc.detail else "An error occurred."
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {"code": code, "message": message},
            "detail": message,
        },
    )
