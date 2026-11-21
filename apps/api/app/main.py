"""
ClipForge API — FastAPI application entry point.

Configures the ASGI app with lifespan events, CORS middleware,
standardized exception handlers, and route handlers.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.routers.analyses import router as analyses_router
from app.routers.auth import router as auth_router
from app.routers.clips import router as clips_router
from app.routers.config import router as config_router
from app.routers.events import router as events_router
from app.routers.projects import router as projects_router
from app.routers.renders import router as renders_router
from app.services.storage_service import StorageService
from app.utils.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    validation_error_handler,
)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    """
    Application lifespan handler.
    """
    yield


app = FastAPI(
    title="ClipForge API",
    description="Backend service for auto-creating clips from streams (Phase 4).",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Exception Handlers (Phase 4 Contract Formatted)
# ---------------------------------------------------------------------------
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(analyses_router)
app.include_router(clips_router)
app.include_router(renders_router)
app.include_router(events_router)
app.include_router(config_router)


# ---------------------------------------------------------------------------
# Root & health endpoints
# ---------------------------------------------------------------------------
@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    """Return basic service identity information."""
    return {"service": "clipforge-api", "version": "0.1.0"}


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    """Lightweight health-check used by Docker and load balancers."""
    return {"status": "healthy"}
