"""
ClipForge API — FastAPI application entry point.

Configures the ASGI app with lifespan events, CORS middleware,
routers, and health-check endpoints.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.auth import router as auth_router
from app.routers.projects import router as projects_router
from app.routers.analyses import router as analyses_router
from app.services.storage_service import StorageService


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    """
    Application lifespan handler.

    On startup: ensures the MinIO storage bucket exists so that
    file uploads work immediately after deployment.
    """
    settings = get_settings()
    storage = StorageService()
    storage.ensure_bucket()
    yield  # application runs between startup and shutdown


app = FastAPI(
    title="ClipForge API",
    description="Backend service for auto-creating clips from streams.",
    version="0.1.0",
    lifespan=lifespan,
)

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
