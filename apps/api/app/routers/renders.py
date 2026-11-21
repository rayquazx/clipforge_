"""
ClipForge API — Renders Router (Phase 4).

Endpoints for polling render status, cancelling in-progress renders, and
obtaining presigned download links.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.clip import Clip
from app.models.render import Render
from app.models.user import User
from app.schemas.render import DownloadResponse, RenderResponse
from app.services.storage_service import StorageService
from app.utils.errors import NotFoundError, ValidationError
from app.utils.filename import sanitize_filename

router = APIRouter(tags=["renders"])
settings = get_settings()


async def _get_render_with_ownership_check(
    render_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> tuple[Render, Clip]:
    """Retrieve Render and verify that the parent Clip belongs to the user."""
    res = await db.execute(select(Render).where(Render.id == render_id))
    render = res.scalars().first()
    if not render:
        raise NotFoundError("Render job not found or access denied.")

    clip_res = await db.execute(
        select(Clip).where(Clip.id == render.clip_id, Clip.user_id == user_id)
    )
    clip = clip_res.scalars().first()
    if not clip:
        raise NotFoundError("Render job not found or access denied.")

    return render, clip


# ============================================================================
# 1. Get Render Details
# GET /renders/{id}
# ============================================================================
@router.get("/renders/{render_id}", response_model=RenderResponse)
async def get_render(
    render_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Retrieve the status and output metadata of a render job."""
    render, _ = await _get_render_with_ownership_check(render_id, current_user.id, db)
    return RenderResponse.model_validate(render)


# ============================================================================
# 2. Cancel Render Job
# POST /renders/{id}/cancel
# ============================================================================
@router.post("/renders/{render_id}/cancel", response_model=RenderResponse)
async def cancel_render(
    render_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Cancel an active or queued render job."""
    render, clip = await _get_render_with_ownership_check(render_id, current_user.id, db)

    if render.status not in ["ready", "failed", "cancelled"]:
        render.status = "cancelled"
        render.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(render)

        # Signal worker via Redis
        try:
            r = aioredis.from_url(settings.REDIS_URL)
            await r.set(f"cancel:render:{render.id}", "1", ex=300)
            # Publish SSE render.cancelled
            payload = json.dumps({
                "event": "render.cancelled",
                "data": {"render_id": str(render.id), "clip_id": str(clip.id)},
            })
            await r.publish(f"events:user:{current_user.id}", payload)
            await r.aclose()
        except Exception:
            pass

    return RenderResponse.model_validate(render)


# ============================================================================
# 3. Presigned Download URL
# GET /renders/{id}/download
# ============================================================================
@router.get("/renders/{render_id}/download", response_model=DownloadResponse)
async def download_render(
    render_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Generate a short-lived presigned download URL and a sanitized filename
    for a completed render.
    """
    render, clip = await _get_render_with_ownership_check(render_id, current_user.id, db)

    if render.status != "ready" or not render.output_key:
        raise ValidationError("Render job is not ready for download.")

    storage = StorageService()
    expires_seconds = 3600
    try:
        url = storage.get_presigned_url(render.output_key, expires=expires_seconds)
    except Exception:
        url = f"/storage/{render.output_key}"

    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_seconds)).isoformat()

    # Determine filename
    custom_filename = render.options.get("filename") if isinstance(render.options, dict) else None
    filename = sanitize_filename(custom_filename or clip.title)

    return {
        "url": url,
        "expires_at": expires_at,
        "filename": filename,
    }
