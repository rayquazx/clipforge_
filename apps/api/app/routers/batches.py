"""
ClipForge API — Batch Export Router (Phase 6).

Endpoints for creating and managing multi-clip export batches, orchestrating
concurrent renders, progress aggregation, and streamed ZIP packaging.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
from typing import Any, List, Optional
import uuid

from celery import Celery
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.ad_template import AdTemplate
from app.models.batch import Batch, BatchItem
from app.models.clip import Clip
from app.models.render import Render
from app.models.user import User
from app.schemas.ad import AdPlacement
from app.schemas.batch import (
    BatchCreateRequest,
    BatchDownloadResponse,
    BatchItemResponse,
    BatchResponse,
    PaginatedBatchesResponse,
)
from app.schemas.render import RenderOptions
from app.services.event_publisher import publish_user_event_async
from app.services.storage_service import StorageService
from app.utils.errors import (
    ForbiddenError,
    NotFoundError,
    ValidationError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/batches", tags=["batches"])
settings = get_settings()
storage = StorageService()

celery_client = Celery("clipforge", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

MAX_BATCH_CLIPS = 50


def _build_batch_response(batch: Batch) -> BatchResponse:
    """Helper to convert ORM Batch and its items into BatchResponse."""
    items_res = [
        BatchItemResponse(
            id=item.id,
            batch_id=item.batch_id,
            clip_id=item.clip_id,
            render_id=item.render_id,
            status=item.status,  # type: ignore[arg-type]
            error_message=item.error_message,
        )
        for item in (batch.items or [])
    ]

    total = len(items_res)
    completed = sum(1 for it in items_res if it.status == "completed")
    failed = sum(1 for it in items_res if it.status == "failed")

    options_obj = RenderOptions.model_validate(batch.options or {})

    return BatchResponse(
        id=batch.id,
        user_id=batch.user_id,
        status=batch.status,  # type: ignore[arg-type]
        total=total,
        completed=completed,
        failed=failed,
        ad_template_id=batch.ad_template_id,
        options=options_obj,
        ads_mode=batch.ads_mode,  # type: ignore[arg-type]
        items=items_res,
        zip_ready=bool(batch.zip_key),
        created_at=batch.created_at,
        finished_at=batch.finished_at,
    )


@router.post("", response_model=BatchResponse, status_code=status.HTTP_201_CREATED)
async def create_batch(
    payload: BatchCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchResponse:
    """
    Create a new batch export job.
    Applies optional ad template on a non-destructive copy of edit_state.
    """
    if len(payload.clip_ids) > MAX_BATCH_CLIPS:
        raise ValidationError(
            f"Batch size of {len(payload.clip_ids)} exceeds maximum limit of {MAX_BATCH_CLIPS} clips."
        )

    # 1. Validate clip ownership
    clips_query = select(Clip).where(
        Clip.id.in_(payload.clip_ids), Clip.user_id == current_user.id
    )
    clips = (await db.execute(clips_query)).scalars().all()
    found_clip_ids = {c.id for c in clips}

    missing_clip_ids = [str(cid) for cid in payload.clip_ids if cid not in found_clip_ids]
    if missing_clip_ids:
        raise NotFoundError(
            f"The following clips were not found or access was denied: {', '.join(missing_clip_ids)}"
        )

    # Map clips in input order
    clip_map = {c.id: c for c in clips}
    ordered_clips = [clip_map[cid] for cid in payload.clip_ids]

    # 2. Validate template if provided
    template_placements: List[dict[str, Any]] = []
    if payload.ad_template_id:
        t_query = select(AdTemplate).where(
            AdTemplate.id == payload.ad_template_id, AdTemplate.user_id == current_user.id
        )
        template = (await db.execute(t_query)).scalar_one_or_none()
        if not template:
            raise NotFoundError("Ad template not found or access denied.")
        template_placements = template.placements or []

    # 3. Create Batch record
    batch_id = uuid.uuid4()
    batch = Batch(
        id=batch_id,
        user_id=current_user.id,
        status="queued",
        ad_template_id=payload.ad_template_id,
        options=payload.options.model_dump(),
        ads_mode=payload.ads_mode,
        zip_key=None,
        created_at=datetime.utcnow(),
    )
    db.add(batch)

    # 4. Create Render records and BatchItem records
    for clip in ordered_clips:
        # Resolve effective edit_state without mutating original clip in DB
        resolved_edit_state = dict(clip.edit_state or {})

        if template_placements and payload.ads_mode in ("replace", "append"):
            # Generate new placement IDs
            fresh_placements = []
            for item in template_placements:
                p_copy = dict(item)
                p_copy["id"] = str(uuid.uuid4())
                fresh_placements.append(p_copy)

            if payload.ads_mode == "replace":
                resolved_edit_state["ads"] = fresh_placements
            else:
                existing_ads = resolved_edit_state.get("ads", [])
                resolved_edit_state["ads"] = existing_ads + fresh_placements

        # Pass effective edit_state via options override so worker renders with ads template
        render_options = payload.options.model_dump()
        render_options["effective_edit_state"] = resolved_edit_state

        render_id = uuid.uuid4()
        render = Render(
            id=render_id,
            clip_id=clip.id,
            status="queued",
            progress=0,
            options=render_options,
        )
        db.add(render)

        item = BatchItem(
            id=uuid.uuid4(),
            batch_id=batch_id,
            clip_id=clip.id,
            render_id=render_id,
            status="queued",
        )
        db.add(item)

    await db.commit()
    await db.refresh(batch)

    # 5. Publish initial SSE progress
    await publish_user_event_async(
        current_user.id,
        "batch.progress",
        {
            "batch_id": str(batch.id),
            "completed": 0,
            "failed": 0,
            "total": len(ordered_clips),
        },
    )

    # 6. Enqueue batch processing task in Celery
    try:
        celery_client.send_task("batch.process_batch", args=[str(batch.id)])
    except Exception as exc:
        logger.warning("Could not dispatch batch Celery task: %s", exc)

    return _build_batch_response(batch)


@router.get("", response_model=PaginatedBatchesResponse)
async def list_batches(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedBatchesResponse:
    """List batches owned by the current user."""
    query = select(Batch).where(Batch.user_id == current_user.id).order_by(desc(Batch.created_at))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    offset = (page - 1) * limit
    batches = (await db.execute(query.offset(offset).limit(limit))).scalars().all()

    items = [_build_batch_response(b) for b in batches]
    return PaginatedBatchesResponse(items=items, total=total, page=page, limit=limit)


@router.get("/{id}", response_model=BatchResponse)
async def get_batch(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchResponse:
    """Retrieve details, status, and items of a specific batch."""
    query = select(Batch).where(Batch.id == id, Batch.user_id == current_user.id)
    batch = (await db.execute(query)).scalar_one_or_none()

    if not batch:
        raise NotFoundError("Batch not found.")

    return _build_batch_response(batch)


@router.post("/{id}/cancel", response_model=BatchResponse)
async def cancel_batch(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchResponse:
    """Cancel a running or queued batch."""
    query = select(Batch).where(Batch.id == id, Batch.user_id == current_user.id)
    batch = (await db.execute(query)).scalar_one_or_none()

    if not batch:
        raise NotFoundError("Batch not found.")

    batch.status = "cancelled"
    batch.finished_at = datetime.utcnow()

    # Cancel unfinished items
    for item in batch.items:
        if item.status in ("queued", "rendering"):
            item.status = "failed"
            item.error_message = "Cancelled by user"
            if item.render_id:
                r_query = select(Render).where(Render.id == item.render_id)
                render = (await db.execute(r_query)).scalar_one_or_none()
                if render and render.status in ("queued", "rendering", "downloading"):
                    render.status = "cancelled"

    await db.commit()
    await db.refresh(batch)

    await publish_user_event_async(
        current_user.id, "batch.completed", {"batch_id": str(batch.id), "status": "cancelled"}
    )
    return _build_batch_response(batch)


@router.post("/{id}/retry-failed", response_model=BatchResponse)
async def retry_failed_batch_items(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchResponse:
    """Retry only the failed items in a completed_with_errors or failed batch."""
    query = select(Batch).where(Batch.id == id, Batch.user_id == current_user.id)
    batch = (await db.execute(query)).scalar_one_or_none()

    if not batch:
        raise NotFoundError("Batch not found.")

    failed_items = [it for it in batch.items if it.status == "failed"]
    if not failed_items:
        return _build_batch_response(batch)

    batch.status = "running"
    batch.finished_at = None

    for item in failed_items:
        item.status = "queued"
        item.error_message = None
        if item.render_id:
            r_query = select(Render).where(Render.id == item.render_id)
            render = (await db.execute(r_query)).scalar_one_or_none()
            if render:
                render.status = "queued"
                render.progress = 0
                render.error_message = None

    await db.commit()
    await db.refresh(batch)

    # Re-dispatch batch processor
    try:
        celery_client.send_task("batch.process_batch", args=[str(batch.id)])
    except Exception as exc:
        logger.warning("Could not dispatch batch retry Celery task: %s", exc)

    return _build_batch_response(batch)


@router.get("/{id}/download", response_model=BatchDownloadResponse)
async def download_batch_zip(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchDownloadResponse:
    """Get signed download URL for the completed batch ZIP archive."""
    query = select(Batch).where(Batch.id == id, Batch.user_id == current_user.id)
    batch = (await db.execute(query)).scalar_one_or_none()

    if not batch:
        raise NotFoundError("Batch not found.")

    if not batch.zip_key:
        raise NotFoundError("Batch ZIP archive is not ready yet.")

    expires_seconds = 3600 * 24  # 24 hours
    signed_url = storage.get_presigned_url(batch.zip_key, expires=expires_seconds)
    expires_at = datetime.utcnow() + timedelta(seconds=expires_seconds)

    filename = f"clipforge_batch_{str(batch.id)[:8]}.zip"

    return BatchDownloadResponse(
        url=signed_url,
        expires_at=expires_at,
        filename=filename,
    )
