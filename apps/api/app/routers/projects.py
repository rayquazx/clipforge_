"""
ClipForge API — Projects Router.

Endpoints for adding video links, manual video uploads, paginated
project listing, project deletion, retry, and Server-Sent Events (SSE).
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import shutil
import subprocess
import tempfile
import uuid
from typing import AsyncGenerator, Optional

import redis.asyncio as aioredis
from celery import Celery
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.project import Project
from app.models.user import User
from app.schemas.project import (
    PaginatedProjectsResponse,
    ProjectCreateRequest,
    ProjectResponse,
)
from app.services.storage_service import StorageService
from app.services.url_parser import InvalidUrlError, parse_video_url

router = APIRouter(prefix="/projects", tags=["projects"])
settings = get_settings()

celery_client = Celery("clipforge", broker=settings.REDIS_URL)


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project from a video link",
)
async def create_project(
    payload: ProjectCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """
    Parse a Twitch, YouTube, or Kick link, check for duplicates for this user,
    persist a queued project, and enqueue the metadata fetch worker task.
    """
    try:
        parsed = parse_video_url(payload.url)
    except InvalidUrlError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    # Check for existing project for this user with the same source URL
    existing = await db.execute(
        select(Project).where(
            Project.user_id == current_user.id,
            Project.source_url == parsed.canonical_url,
        )
    )
    if existing.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already added this video link to your projects.",
        )

    project = Project(
        user_id=current_user.id,
        source_type=parsed.platform,
        source_url=parsed.canonical_url,
        external_id=parsed.external_id,
        title="Fetching video metadata...",
        status="queued",
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Enqueue background task in Celery
    try:
        celery_client.send_task("metadata.fetch", args=[str(project.id)])
    except Exception as exc:
        # Don't fail the request if Celery broker connection fails momentarily
        pass

    return ProjectResponse.model_validate(project)


@router.post(
    "/upload",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project by uploading a video file",
)
async def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """
    Accept an MP4, MOV, MKV, or WEBM video file, store it in MinIO,
    extract its duration & thumbnail via ffmpeg/ffprobe, and create a ready project.
    """
    allowed_extensions = {".mp4", ".mov", ".mkv", ".webm"}
    original_filename = file.filename or "video.mp4"
    ext = os.path.splitext(original_filename)[1].lower()

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported video format '{ext}'. Allowed formats: MP4, MOV, MKV, WEBM.",
        )

    project_id = uuid.uuid4()
    storage = StorageService()

    # Save to temp file to probe and upload
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        shutil.copyfileobj(file.file, tmp)

    duration_seconds = 0
    thumbnail_key: Optional[str] = None
    raw_video_key = f"raw/{project_id}/{original_filename}"

    try:
        # Probe duration with ffprobe if installed
        try:
            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                tmp_path,
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
            if res.returncode == 0 and res.stdout.strip():
                duration_seconds = int(float(res.stdout.strip()))
        except Exception:
            duration_seconds = 0

        # Upload video to MinIO
        with open(tmp_path, "rb") as fh:
            data = fh.read()
            storage.upload_file(
                key=raw_video_key,
                data=data,
                content_type=file.content_type or "video/mp4",
            )

        # Generate thumbnail frame if ffmpeg is available
        thumb_tmp_path = f"{tmp_path}.jpg"
        try:
            seek_pos = "00:00:01" if duration_seconds > 2 else "00:00:00"
            thumb_cmd = [
                "ffmpeg",
                "-ss",
                seek_pos,
                "-i",
                tmp_path,
                "-vframes",
                "1",
                "-q:v",
                "2",
                thumb_tmp_path,
                "-y",
            ]
            res = subprocess.run(thumb_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
            if res.returncode == 0 and os.path.exists(thumb_tmp_path):
                thumb_key = f"thumbnails/{project_id}.jpg"
                with open(thumb_tmp_path, "rb") as tf:
                    storage.upload_file(key=thumb_key, data=tf.read(), content_type="image/jpeg")
                thumbnail_key = storage.get_presigned_url(thumb_key, expires=86400 * 7)
        except Exception:
            thumbnail_key = None
        finally:
            if os.path.exists(thumb_tmp_path):
                os.remove(thumb_tmp_path)

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    title = os.path.splitext(original_filename)[0].replace("_", " ").title()

    project = Project(
        id=project_id,
        user_id=current_user.id,
        source_type="upload",
        source_url=f"upload://{original_filename}",
        external_id=str(project_id),
        title=title,
        channel_name=current_user.display_name,
        duration_seconds=duration_seconds,
        thumbnail_url=thumbnail_key,
        status="ready",
        raw_video_key=raw_video_key,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return ProjectResponse.model_validate(project)


@router.get(
    "",
    response_model=PaginatedProjectsResponse,
    summary="Get paginated list of projects for the current user",
)
async def list_projects(
    page: int = Query(1, ge=1, description="Page number starting at 1"),
    limit: int = Query(12, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Optional status filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedProjectsResponse:
    """Return paginated projects owned by the authenticated user."""
    query = select(Project).where(Project.user_id == current_user.id)

    if status:
        query = query.where(Project.status == status)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Query items ordered by created_at DESC
    offset = (page - 1) * limit
    items_query = query.order_by(desc(Project.created_at)).offset(offset).limit(limit)
    items_result = await db.execute(items_query)
    items = items_result.scalars().all()

    total_pages = math.ceil(total / limit) if total > 0 else 1

    return PaginatedProjectsResponse(
        items=[ProjectResponse.model_validate(p) for p in items],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get a project by ID",
)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Retrieve a project by ID. Returns 404 if not found or unauthorized."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    project = result.scalars().first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )
    return ProjectResponse.model_validate(project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a project and its stored files",
)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Delete a project and any associated assets in MinIO."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    project = result.scalars().first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    # Clean up storage files if present
    storage = StorageService()
    if project.raw_video_key:
        storage.delete_file(project.raw_video_key)
    if project.audio_key:
        storage.delete_file(project.audio_key)

    await db.delete(project)
    await db.commit()

    return {"deleted": True, "id": str(project_id)}


@router.post(
    "/{project_id}/retry",
    response_model=ProjectResponse,
    summary="Retry metadata fetching for a failed project",
)
async def retry_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Reset a failed project to queued and trigger metadata extraction again."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    project = result.scalars().first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    project.status = "queued"
    project.error_message = None
    await db.commit()
    await db.refresh(project)

    try:
        celery_client.send_task("metadata.fetch", args=[str(project.id)])
    except Exception:
        pass

    return ProjectResponse.model_validate(project)


@router.get(
    "/{project_id}/events",
    summary="Server-Sent Events (SSE) stream for real-time project status updates",
)
async def project_events(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Streams Server-Sent Events (SSE) with status updates for the project.
    Subscribes to the Redis pub/sub channel 'project_events:{project_id}'.
    """
    # Verify ownership
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id,
        )
    )
    project = result.scalars().first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send initial state event
        initial_payload = {
            "type": "initial_state",
            "project_id": str(project.id),
            "status": project.status,
            "title": project.title,
            "channel_name": project.channel_name,
            "duration_seconds": project.duration_seconds,
            "thumbnail_url": project.thumbnail_url,
            "error_message": project.error_message,
        }
        yield f"data: {json.dumps(initial_payload)}\n\n"

        # If already terminal, keep alive briefly or yield
        if project.status in ("ready", "failed"):
            return

        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = r.pubsub()
        channel_name = f"project_events:{project_id}"
        await pubsub.subscribe(channel_name)

        try:
            while True:
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg and msg.get("type") == "message":
                    data = msg.get("data")
                    yield f"data: {data}\n\n"

                    try:
                        parsed = json.loads(data)
                        if parsed.get("status") in ("ready", "failed"):
                            break
                    except Exception:
                        pass

                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel_name)
            await pubsub.close()
            await r.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
