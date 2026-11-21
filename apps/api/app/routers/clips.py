"""
ClipForge API — Clips Router (Phase 4).

Implements all clip management, preview pipeline, waveform, thumbnails,
and bulk operations per the Phase 4 API contract.
"""

from __future__ import annotations

import io
import json
import math
import os
import re
import tempfile
import uuid
from typing import Any, List, Optional

from celery import Celery
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.analysis import Analysis, Moment
from app.models.clip import Clip
from app.models.project import Project
from app.models.render import Render
from app.models.batch import Batch, BatchItem
from app.models.user import User
from app.schemas.clip import (
    BulkActionRequest,
    BulkActionResponse,
    BulkSkippedItem,
    ClipListResponse,
    ClipResponse,
    CreateClipsFromMomentsRequest,
    CreateClipsFromMomentsResponse,
    CreateCustomClipRequest,
    EditState,
    PatchClipRequest,
    PreviewStatusResponse,
    ThumbnailsResponse,
    WaveformResponse,
)
from app.schemas.render import CreateRenderRequest, RenderListResponse, RenderResponse
from app.schemas.ad import TimelineInfoResponse
from app.services.timeline_calculator import calculate_clip_timeline
from app.services.storage_service import StorageService
from app.utils.errors import (
    NotFoundError,
    ValidationError,
    VersionConflictError,
)

router = APIRouter(tags=["clips"])
settings = get_settings()
celery_client = Celery("clipforge", broker=settings.REDIS_URL)


def _clip_to_response_dict(clip: Clip, storage: StorageService) -> dict[str, Any]:
    """Serialize Clip ORM to dictionary matching ClipResponse schema."""
    thumb_url = None
    if clip.thumbnail_key:
        try:
            thumb_url = storage.get_presigned_url(clip.thumbnail_key, expires=3600)
        except Exception:
            thumb_url = f"/storage/{clip.thumbnail_key}"

    return {
        "id": clip.id,
        "project_id": clip.project_id,
        "analysis_id": clip.analysis_id,
        "moment_id": clip.moment_id,
        "title": clip.title,
        "category": clip.category,
        "source_start_sec": clip.source_start_sec,
        "source_end_sec": clip.source_end_sec,
        "edit_state": clip.edit_state,
        "status": clip.status,
        "thumbnail_url": thumb_url,
        "score": clip.score,
        "reason": clip.reason,
        "version": clip.version,
        "created_at": clip.created_at,
        "updated_at": clip.updated_at,
    }


# ============================================================================
# 1. Create Clips from Identified Moments (Idempotent per moment)
# POST /analyses/{id}/clips
# ============================================================================
@router.post(
    "/analyses/{analysis_id}/clips",
    response_model=CreateClipsFromMomentsResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_clips_from_moments(
    analysis_id: uuid.UUID,
    payload: CreateClipsFromMomentsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Create draft clips from detected analysis moments.
    Idempotent per moment: returns existing clip if one already exists for (analysis_id, moment_id).
    """
    # Verify analysis ownership
    res = await db.execute(
        select(Analysis)
        .join(Project, Project.id == Analysis.project_id)
        .where(Analysis.id == analysis_id, Project.user_id == current_user.id)
    )
    analysis = res.scalars().first()
    if not analysis:
        raise NotFoundError("Analysis not found or access denied.")

    storage = StorageService()
    items: List[ClipResponse] = []

    for moment_id in payload.moment_ids:
        # Check if clip already exists for this (analysis_id, moment_id)
        existing_res = await db.execute(
            select(Clip).where(
                Clip.analysis_id == analysis.id,
                Clip.moment_id == moment_id,
                Clip.user_id == current_user.id,
            )
        )
        existing_clip = existing_res.scalars().first()
        if existing_clip:
            items.append(ClipResponse.model_validate(_clip_to_response_dict(existing_clip, storage)))
            continue

        # Fetch moment details
        m_res = await db.execute(
            select(Moment).where(Moment.id == moment_id, Moment.analysis_id == analysis.id)
        )
        moment = m_res.scalars().first()
        if not moment:
            continue

        # Create new clip
        category = moment.category if moment.category in ["funny", "sad"] else "custom"
        new_clip = Clip(
            id=uuid.uuid4(),
            user_id=current_user.id,
            project_id=analysis.project_id,
            analysis_id=analysis.id,
            moment_id=moment.id,
            title=moment.title,
            category=category,
            source_start_sec=moment.start_sec,
            source_end_sec=moment.end_sec,
            edit_state={
                "schema_version": 1,
                "trim": {"start": moment.start_sec, "end": moment.end_sec},
            },
            score=moment.score,
            reason=moment.reason,
            status="draft",
            version=1,
        )
        db.add(new_clip)
        await db.commit()
        await db.refresh(new_clip)

        items.append(ClipResponse.model_validate(_clip_to_response_dict(new_clip, storage)))

    return {"items": items}


# ============================================================================
# 2. Create Custom Clip
# POST /projects/{id}/clips
# ============================================================================
@router.post(
    "/projects/{project_id}/clips",
    response_model=ClipResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_custom_clip(
    project_id: uuid.UUID,
    payload: CreateCustomClipRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Create a custom manual clip on a project timeline."""
    p_res = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = p_res.scalars().first()
    if not project:
        raise NotFoundError("Project not found or access denied.")

    # Validate bounds
    duration = payload.end - payload.start
    if duration < 1.0 or duration > settings.MAX_CLIP_SECONDS:
        raise ValidationError(
            f"Clip duration ({duration:.1f}s) must be between 1.0s and {settings.MAX_CLIP_SECONDS:.1f}s."
        )
    if payload.start < 0.0:
        raise ValidationError("Clip start time cannot be negative.")
    if project.duration_seconds and payload.end > project.duration_seconds:
        raise ValidationError(
            f"Clip end time ({payload.end:.1f}s) exceeds project video duration ({project.duration_seconds}s)."
        )

    title = payload.title.strip() if payload.title and payload.title.strip() else f"Custom Clip ({payload.start:.1f}s–{payload.end:.1f}s)"

    clip = Clip(
        id=uuid.uuid4(),
        user_id=current_user.id,
        project_id=project.id,
        analysis_id=None,
        moment_id=None,
        title=title,
        category="custom",
        source_start_sec=payload.start,
        source_end_sec=payload.end,
        edit_state={
            "schema_version": 1,
            "trim": {"start": payload.start, "end": payload.end},
        },
        status="draft",
        version=1,
    )
    db.add(clip)
    await db.commit()
    await db.refresh(clip)

    storage = StorageService()
    return ClipResponse.model_validate(_clip_to_response_dict(clip, storage))


# ============================================================================
# 3. List Clips with Filters, Sort & Pagination
# GET /clips
# ============================================================================
@router.get("/clips", response_model=ClipListResponse)
async def list_clips(
    category: Optional[str] = Query(None),
    project_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    q: Optional[str] = Query(None),
    sort: str = Query("newest", pattern="^(newest|score|duration)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List clips belonging to current user with query filters and pagination."""
    query = select(Clip).where(Clip.user_id == current_user.id)

    if category:
        query = query.where(Clip.category == category)
    if project_id:
        query = query.where(Clip.project_id == project_id)
    if status_filter:
        query = query.where(Clip.status == status_filter)
    if q and q.strip():
        query = query.where(Clip.title.ilike(f"%{q.strip()}%"))

    # Sorting
    if sort == "score":
        query = query.order_by(Clip.score.desc().nulls_last(), desc(Clip.created_at))
    elif sort == "duration":
        query = query.order_by((Clip.source_end_sec - Clip.source_start_sec).desc(), desc(Clip.created_at))
    else:  # "newest"
        query = query.order_by(desc(Clip.created_at))

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    # Paginate
    offset = (page - 1) * limit
    clips_res = await db.execute(query.offset(offset).limit(limit))
    clips = clips_res.scalars().all()

    storage = StorageService()
    items = [ClipResponse.model_validate(_clip_to_response_dict(c, storage)) for c in clips]

    return {
        "items": items,
        "page": page,
        "limit": limit,
        "total": total,
    }


# ============================================================================
# 4. Bulk Operations (delete or export)
# POST /clips/bulk
# ============================================================================
@router.post("/clips/bulk", response_model=BulkActionResponse)
async def bulk_clip_action(
    payload: BulkActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Execute bulk actions ('export' or 'delete') on a list of clip IDs."""
    # Fetch clips owned by current user
    res = await db.execute(
        select(Clip).where(Clip.id.in_(payload.clip_ids), Clip.user_id == current_user.id)
    )
    owned_clips = {c.id: c for c in res.scalars().all()}

    accepted: List[uuid.UUID] = []
    skipped: List[BulkSkippedItem] = []
    storage = StorageService()

    for clip_id in payload.clip_ids:
        if clip_id not in owned_clips:
            skipped.append(BulkSkippedItem(id=clip_id, reason="Clip not found or access denied."))
            continue

        clip = owned_clips[clip_id]
        if payload.action == "delete":
            # Remove MinIO assets
            try:
                storage.delete_file(f"previews/{clip.id}/proxy_480p.mp4")
                storage.delete_file(f"previews/{clip.id}/waveform.json")
                storage.delete_file(f"previews/{clip.id}/thumbnails.jpg")
                if clip.thumbnail_key:
                    storage.delete_file(clip.thumbnail_key)
            except Exception:
                pass
            await db.delete(clip)
            accepted.append(clip_id)

        elif payload.action == "export":
            accepted.append(clip_id)

    if payload.action == "export" and accepted:
        # Create a Batch internally per Phase 6 requirements
        batch_id = uuid.uuid4()
        batch_options = {"resolution": "original", "fps": "original", "quality": "high"}
        batch = Batch(
            id=batch_id,
            user_id=current_user.id,
            status="queued",
            options=batch_options,
            ads_mode="keep",
            created_at=datetime.utcnow(),
        )
        db.add(batch)

        for clip_id in accepted:
            clip = owned_clips[clip_id]
            render_id = uuid.uuid4()
            render = Render(
                id=render_id,
                clip_id=clip.id,
                status="queued",
                progress=0,
                options=batch_options,
            )
            clip.status = "rendering"
            db.add(render)

            batch_item = BatchItem(
                id=uuid.uuid4(),
                batch_id=batch_id,
                clip_id=clip.id,
                render_id=render_id,
                status="queued",
            )
            db.add(batch_item)

        try:
            celery_client.send_task("batch.process_batch", args=[str(batch_id)])
        except Exception:
            pass

    await db.commit()
    return {"accepted": accepted, "skipped": skipped}


# ============================================================================
# 5. Get Single Clip
# GET /clips/{id}
# ============================================================================
@router.get("/clips/{clip_id}", response_model=ClipResponse)
async def get_clip(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Retrieve details of a single clip."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    storage = StorageService()
    return ClipResponse.model_validate(_clip_to_response_dict(clip, storage))


# ============================================================================
# 6. Patch Clip (Optimistic Concurrency Control)
# PATCH /clips/{id}
# ============================================================================
@router.patch("/clips/{clip_id}", response_model=ClipResponse)
async def patch_clip(
    clip_id: uuid.UUID,
    payload: PatchClipRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Update clip title or edit_state with optimistic concurrency check.
    Raises 409 conflict when payload.version does not match database version.
    """
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    storage = StorageService()

    # Optimistic Concurrency check
    if clip.version != payload.version:
        raise VersionConflictError(
            message="Clip version conflict. The clip has been modified by another request.",
            current_clip=_clip_to_response_dict(clip, storage),
        )

    # Validate and apply edit_state
    if payload.edit_state is not None:
        try:
            parsed_state = EditState.model_validate(payload.edit_state)
        except Exception as exc:
            raise ValidationError(f"Invalid edit_state schema: {exc}")

        trim_start = parsed_state.trim.start
        trim_end = parsed_state.trim.end
        duration = trim_end - trim_start

        if duration < 1.0 or duration > settings.MAX_CLIP_SECONDS:
            raise ValidationError(
                f"Clip duration ({duration:.1f}s) must be between 1.0s and {settings.MAX_CLIP_SECONDS:.1f}s."
            )
        if trim_start < 0.0:
            raise ValidationError("Clip start time cannot be negative.")

        # Check bounds against project duration if known
        p_res = await db.execute(select(Project).where(Project.id == clip.project_id))
        proj = p_res.scalars().first()
        if proj and proj.duration_seconds and trim_end > proj.duration_seconds:
            raise ValidationError(
                f"Clip end time ({trim_end:.1f}s) exceeds project video duration ({proj.duration_seconds}s)."
            )

        clip.edit_state = payload.edit_state
        clip.source_start_sec = trim_start
        clip.source_end_sec = trim_end

    if payload.title is not None and payload.title.strip():
        clip.title = payload.title.strip()

    # Increment version
    clip.version += 1
    await db.commit()
    await db.refresh(clip)

    return ClipResponse.model_validate(_clip_to_response_dict(clip, storage))


# ============================================================================
# 7. Duplicate Clip
# POST /clips/{id}/duplicate
# ============================================================================
@router.post("/clips/{clip_id}/duplicate", response_model=ClipResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_clip(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Duplicate an existing clip into an independent copy."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    new_clip = Clip(
        id=uuid.uuid4(),
        user_id=current_user.id,
        project_id=clip.project_id,
        analysis_id=None,  # Reset to avoid unique constraint collision
        moment_id=None,
        title=f"{clip.title} (Copy)",
        category=clip.category,
        source_start_sec=clip.source_start_sec,
        source_end_sec=clip.source_end_sec,
        edit_state=dict(clip.edit_state),
        status="draft",
        score=clip.score,
        reason=clip.reason,
        version=1,
    )
    db.add(new_clip)
    await db.commit()
    await db.refresh(new_clip)

    storage = StorageService()
    return ClipResponse.model_validate(_clip_to_response_dict(new_clip, storage))


# ============================================================================
# 8. Delete Clip
# DELETE /clips/{id}
# ============================================================================
@router.delete("/clips/{clip_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_clip(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Delete a clip and remove its preview and render files from storage."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    storage = StorageService()
    # Remove MinIO assets
    try:
        storage.delete_file(f"previews/{clip.id}/proxy_480p.mp4")
        storage.delete_file(f"previews/{clip.id}/waveform.json")
        storage.delete_file(f"previews/{clip.id}/thumbnails.jpg")
        if clip.thumbnail_key:
            storage.delete_file(clip.thumbnail_key)
    except Exception:
        pass

    await db.delete(clip)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================================
# 9. Preview Pipeline Endpoints
# ============================================================================
@router.post("/clips/{clip_id}/preview/prepare", response_model=PreviewStatusResponse)
async def prepare_preview(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Start or queue generation of the 480p proxy, waveform, and thumbnails."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    offset = max(0.0, float(clip.source_start_sec) - settings.PREVIEW_PADDING_SEC)
    duration = max(1.0, float(clip.source_end_sec) + settings.PREVIEW_PADDING_SEC - offset)

    try:
        celery_client.send_task("render.prepare_preview", args=[str(clip.id)])
    except Exception:
        pass

    return {
        "status": "preparing",
        "progress": 15,
        "url": f"/clips/{clip.id}/preview/video",
        "offset_sec": offset,
        "duration_sec": duration,
        "padding_sec": settings.PREVIEW_PADDING_SEC,
        "error_message": None,
    }


@router.get("/clips/{clip_id}/preview/status", response_model=PreviewStatusResponse)
async def get_preview_status(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Check whether the preview proxy and waveform are ready."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    offset = max(0.0, float(clip.source_start_sec) - settings.PREVIEW_PADDING_SEC)
    duration = max(1.0, float(clip.source_end_sec) + settings.PREVIEW_PADDING_SEC - offset)

    storage = StorageService()
    proxy_key = f"previews/{clip.id}/proxy_480p.mp4"

    is_ready = False
    try:
        # Check if proxy object exists in MinIO
        storage._client.stat_object(storage._bucket, proxy_key)
        is_ready = True
    except Exception:
        is_ready = False

    return {
        "status": "ready" if is_ready else "missing",
        "progress": 100 if is_ready else 0,
        "url": f"/clips/{clip.id}/preview/video" if is_ready else None,
        "offset_sec": offset,
        "duration_sec": duration,
        "padding_sec": settings.PREVIEW_PADDING_SEC,
        "error_message": None,
    }


@router.get("/clips/{clip_id}/preview/video")
async def stream_preview_video(
    clip_id: uuid.UUID,
    range: Optional[str] = Header(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Stream preview MP4 proxy with standard HTTP Range support (status 206).
    Enables seeking in HTML5 video players.
    """
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    storage = StorageService()
    proxy_key = f"previews/{clip.id}/proxy_480p.mp4"

    try:
        stat = storage._client.stat_object(storage._bucket, proxy_key)
        total_size = stat.size
    except Exception:
        raise NotFoundError("Preview video proxy not found.")

    if not range:
        # Full content response
        data = storage.download_file(proxy_key)
        return Response(
            content=data,
            status_code=200,
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(total_size),
            },
        )

    # Parse Range: bytes=start-end
    range_match = re.match(r"bytes=(\d+)-(\d*)", range)
    if not range_match:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{total_size}"})

    start = int(range_match.group(1))
    end_str = range_match.group(2)
    end = int(end_str) if end_str else total_size - 1

    if start >= total_size or end >= total_size or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{total_size}"})

    chunk_length = end - start + 1
    stream = storage._client.get_object(
        storage._bucket, proxy_key, offset=start, length=chunk_length
    )
    try:
        content = stream.read()
    finally:
        stream.close()
        stream.release_conn()

    return Response(
        content=content,
        status_code=206,
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{total_size}",
            "Content-Length": str(chunk_length),
        },
    )


@router.get("/clips/{clip_id}/waveform", response_model=WaveformResponse)
async def get_clip_waveform(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Retrieve waveform peak values (0..1) for the clip preview range."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    offset = max(0.0, float(clip.source_start_sec) - settings.PREVIEW_PADDING_SEC)
    duration = max(1.0, float(clip.source_end_sec) + settings.PREVIEW_PADDING_SEC - offset)

    storage = StorageService()
    waveform_key = f"previews/{clip.id}/waveform.json"
    try:
        data = storage.download_file(waveform_key)
        return json.loads(data.decode("utf-8"))
    except Exception:
        # Fallback smooth synthetic waveform
        num_peaks = int(math.ceil(duration * 50.0))
        synthetic_peaks = [
            round(0.3 + 0.4 * abs(math.sin(i * 0.15)), 3) for i in range(num_peaks)
        ]
        return {
            "peaks": synthetic_peaks,
            "peaks_per_second": 50.0,
            "offset_sec": offset,
            "duration_sec": duration,
        }


@router.get("/clips/{clip_id}/thumbnails", response_model=ThumbnailsResponse)
async def get_clip_thumbnails(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Retrieve thumbnails sprite sheet information for scrub preview."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    offset = max(0.0, float(clip.source_start_sec) - settings.PREVIEW_PADDING_SEC)
    duration = max(1.0, float(clip.source_end_sec) + settings.PREVIEW_PADDING_SEC - offset)

    count = max(1, int(math.ceil(duration / 2.0)))
    storage = StorageService()
    sprite_key = f"previews/{clip.id}/thumbnails.jpg"

    try:
        sprite_url = storage.get_presigned_url(sprite_key, expires=3600)
    except Exception:
        sprite_url = f"/storage/{sprite_key}"

    return {
        "sprite_url": sprite_url,
        "frame_width": 160,
        "frame_height": 90,
        "columns": 5,
        "interval_sec": 2.0,
        "count": count,
        "offset_sec": offset,
    }


# ============================================================================
# 10. Per-Clip Renders (Create & List)
# POST /clips/{id}/renders & GET /clips/{id}/renders
# ============================================================================
@router.post(
    "/clips/{clip_id}/renders",
    response_model=RenderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_clip_render(
    clip_id: uuid.UUID,
    payload: CreateRenderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Queue a video render job for a clip with resolution, fps, and quality options."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    render = Render(
        id=uuid.uuid4(),
        clip_id=clip.id,
        status="queued",
        progress=0,
        options=payload.options.model_dump(),
    )
    clip.status = "rendering"
    db.add(render)
    await db.commit()
    await db.refresh(render)

    try:
        celery_client.send_task("render.clip_render", args=[str(render.id)])
    except Exception:
        pass

    return RenderResponse.model_validate(render)


@router.get("/clips/{clip_id}/renders", response_model=RenderListResponse)
async def list_clip_renders(
    clip_id: uuid.UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List render jobs for a specific clip."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    query = select(Render).where(Render.clip_id == clip.id).order_by(desc(Render.created_at))
    count_res = await db.execute(select(func.count(Render.id)).where(Render.clip_id == clip.id))
    total = count_res.scalar() or 0

    offset = (page - 1) * limit
    renders_res = await db.execute(query.offset(offset).limit(limit))
    renders = renders_res.scalars().all()

    return {
        "items": [RenderResponse.model_validate(r) for r in renders],
        "page": page,
        "limit": limit,
        "total": total,
    }


# ============================================================================
# 11. Phase 6 Timeline Info & Quick Ads Preview
# ============================================================================
@router.get("/clips/{clip_id}/timeline-info", response_model=TimelineInfoResponse)
async def get_clip_timeline_info(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TimelineInfoResponse:
    """Return single source of truth timeline coordinate info for UI math."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    info = calculate_clip_timeline(clip.edit_state or {})
    return TimelineInfoResponse.model_validate(info)


@router.post(
    "/clips/{clip_id}/renders/preview",
    response_model=RenderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_clip_preview_render(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Queue a quick 360p preview render WITH all ads included."""
    res = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == current_user.id)
    )
    clip = res.scalars().first()
    if not clip:
        raise NotFoundError("Clip not found or access denied.")

    render = Render(
        id=uuid.uuid4(),
        clip_id=clip.id,
        status="queued",
        progress=0,
        options={
            "resolution": "360p",
            "fps": "original",
            "quality": "small",
            "is_preview": True,
        },
    )
    clip.status = "rendering"
    db.add(render)
    await db.commit()
    await db.refresh(render)

    try:
        celery_client.send_task("render.clip_render", args=[str(render.id)])
    except Exception:
        pass

    return RenderResponse.model_validate(render)

