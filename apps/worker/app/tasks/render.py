"""
ClipForge Worker — Render & Preview Celery Tasks (Phase 4).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from app.celery_app import celery_app
from app.render.runner import RenderRunner
from app.services.media_fetcher import cleanup_unused_source_media
from app.services.preview_service import PreviewService

logger = logging.getLogger(__name__)


@celery_app.task(name="render.clip_render", bind=True, max_retries=3)
def clip_render_task(self: Any, render_id: str, **kwargs: Any) -> Dict[str, Any]:
    """
    Execute clip render pipeline with live progress, retry up to 3 times,
    and cancellation checking.
    """
    logger.info("Starting render task %s for render_id=%s", self.request.id, render_id)
    try:
        runner = RenderRunner(render_id)
        result = asyncio.run(runner.execute())
        return result
    except Exception as exc:
        logger.exception("Render task %s failed: %s", self.request.id, exc)
        if self.request.retries < self.max_retries:
            countdown = 2 ** self.request.retries
            raise self.retry(exc=exc, countdown=countdown)
        raise exc


@celery_app.task(name="render.prepare_preview", bind=True, max_retries=3)
def prepare_preview_task(self: Any, clip_id: str, **kwargs: Any) -> Dict[str, Any]:
    """
    Build proxy, waveform, thumbnails, and clip thumbnail for a clip.
    """
    logger.info("Starting preview task %s for clip_id=%s", self.request.id, clip_id)
    try:
        result = asyncio.run(PreviewService.prepare_preview(clip_id))
        return result
    except Exception as exc:
        logger.exception("Preview task %s failed: %s", self.request.id, exc)
        if self.request.retries < self.max_retries:
            countdown = 2 ** self.request.retries
            raise self.retry(exc=exc, countdown=countdown)
        raise exc


@celery_app.task(name="media.cleanup_unused")
def cleanup_unused_media_task(retention_days: int = 7) -> Dict[str, int]:
    """Periodic task to clean up cached source media unused for N days."""
    logger.info("Running cleanup for media unused for %d days", retention_days)
    deleted = asyncio.run(cleanup_unused_source_media(retention_days=retention_days))
    return {"deleted": deleted}
