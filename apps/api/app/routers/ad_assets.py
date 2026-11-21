"""
ClipForge API — Ad Assets Router (Phase 6).

Endpoints for managing advertisement creatives (video, image, text),
validating media via ffprobe, generating thumbnails and text PNGs,
streaming previews with HTTP Range support, and enforcing delete protection.
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Any, List, Optional
import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import Response, StreamingResponse
from PIL import Image
from sqlalchemy import delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.ad_asset import AdAsset
from app.models.ad_template import AdTemplate
from app.models.clip import Clip
from app.models.user import User
from app.schemas.ad import (
    AdAssetCreateRequest,
    AdAssetResponse,
    AdAssetUpdateRequest,
    AdTextConfig,
    PaginatedAdAssetsResponse,
)
from app.services.event_publisher import publish_user_event_async
from app.services.storage_service import StorageService
from app.services.text_ad_renderer import render_text_ad_png
from app.utils.errors import (
    ForbiddenError,
    InUseError,
    InvalidPlacementError,
    MediaTooLargeError,
    NotFoundError,
    UnsupportedMediaError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ad-assets", tags=["ad-assets"])
storage = StorageService()

MAX_VIDEO_SIZE = 200 * 1024 * 1024  # 200 MB
MAX_VIDEO_DURATION = 60.5  # Max 60 seconds (with 0.5s tolerance)
ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".webm"}
ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def _build_asset_response(asset: AdAsset) -> AdAssetResponse:
    """Helper to populate presigned URLs into AdAssetResponse."""
    url: Optional[str] = None
    thumb_url: Optional[str] = None

    if asset.storage_key:
        try:
            url = storage.get_presigned_url(asset.storage_key, expires=3600 * 24)
        except Exception:
            url = None

    if asset.thumbnail_key:
        try:
            thumb_url = storage.get_presigned_url(asset.thumbnail_key, expires=3600 * 24)
        except Exception:
            thumb_url = None

    text_cfg = None
    if asset.text_config:
        try:
            text_cfg = AdTextConfig.model_validate(asset.text_config)
        except Exception:
            text_cfg = None

    return AdAssetResponse(
        id=asset.id,
        user_id=asset.user_id,
        name=asset.name,
        kind=asset.kind,  # type: ignore[arg-type]
        url=url,
        thumbnail_url=thumb_url,
        duration_sec=asset.duration_sec,
        width=asset.width,
        height=asset.height,
        has_audio=asset.has_audio,
        file_size=asset.file_size,
        text_config=text_cfg,
        tags=asset.tags or [],
        status=asset.status,  # type: ignore[arg-type]
        usage_count=asset.usage_count,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


def _probe_media(file_path: str) -> dict[str, Any]:
    """Run ffprobe on file_path and parse JSON metadata."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=format_name,duration,size:stream=index,codec_type,codec_name,width,height",
        "-of", "json",
        file_path,
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return json.loads(proc.stdout)
    except Exception as exc:
        logger.warning("ffprobe failed on %s: %s", file_path, exc)
        raise UnsupportedMediaError("Could not inspect media file format with ffprobe.")


@router.get("", response_model=PaginatedAdAssetsResponse)
async def list_ad_assets(
    kind: Optional[str] = Query(None, description="Filter by asset kind (video, image, text)"),
    q: Optional[str] = Query(None, description="Search term for asset name or tags"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedAdAssetsResponse:
    """List ad creatives belonging to the current user."""
    query = select(AdAsset).where(AdAsset.user_id == current_user.id)

    if kind:
        query = query.where(AdAsset.kind == kind)

    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.where(func.lower(AdAsset.name).ilike(term))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    offset = (page - 1) * limit
    results = (
        await db.execute(
            query.order_by(desc(AdAsset.created_at)).offset(offset).limit(limit)
        )
    ).scalars().all()

    items = [_build_asset_response(a) for a in results]
    return PaginatedAdAssetsResponse(items=items, total=total, page=page, limit=limit)


@router.post("", response_model=AdAssetResponse, status_code=status.HTTP_201_CREATED)
async def create_ad_asset(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdAssetResponse:
    """
    Upload an ad asset.
    Supports either:
      1) multipart/form-data with `file`, `name`, and optional `tags`
      2) application/json with `AdAssetCreateRequest` for text ads
    """
    storage.ensure_bucket()
    content_type = request.headers.get("content-type", "")

    # -------------------------------------------------------------------------
    # Case A: JSON Payload (Text Ads)
    # -------------------------------------------------------------------------
    if "application/json" in content_type:
        body = await request.json()
        req_data = AdAssetCreateRequest.model_validate(body)

        asset_id = uuid.uuid4()
        png_bytes, width, height = render_text_ad_png(
            text=req_data.text_config.text,
            font_name=req_data.text_config.font,
            font_size=req_data.text_config.size,
            text_color=req_data.text_config.color,
            stroke_color=req_data.text_config.stroke,
            bg_color=req_data.text_config.bg,
            bg_opacity=req_data.text_config.bg_opacity if req_data.text_config.bg_opacity is not None else 0.8,
        )

        storage_key = f"ad_assets/{asset_id}/text.png"
        storage.upload_file(storage_key, png_bytes, content_type="image/png")

        asset = AdAsset(
            id=asset_id,
            user_id=current_user.id,
            name=req_data.name,
            kind="text",
            storage_key=storage_key,
            thumbnail_key=storage_key,
            duration_sec=None,
            width=width,
            height=height,
            has_audio=False,
            file_size=len(png_bytes),
            text_config=req_data.text_config.model_dump(),
            tags=req_data.tags,
            status="ready",
            usage_count=0,
        )
        db.add(asset)
        await db.commit()
        await db.refresh(asset)

        await publish_user_event_async(
            current_user.id, "ad_asset.ready", {"ad_asset_id": str(asset.id)}
        )
        return _build_asset_response(asset)

    # -------------------------------------------------------------------------
    # Case B: Multipart Upload (Video & Image Ads)
    # -------------------------------------------------------------------------
    form = await request.form()
    uploaded_file = form.get("file")
    name = form.get("name")
    tags_raw = form.get("tags")

    if not uploaded_file or not hasattr(uploaded_file, "filename"):
        raise UnsupportedMediaError("Multipart upload requires a 'file' field.")

    filename = uploaded_file.filename or "media"
    ext = os.path.splitext(filename)[1].lower()

    if not name or not str(name).strip():
        name = os.path.splitext(filename)[0]
    else:
        name = str(name).strip()

    tags: List[str] = []
    if tags_raw:
        if isinstance(tags_raw, str):
            try:
                parsed = json.loads(tags_raw)
                tags = parsed if isinstance(parsed, list) else [tags_raw]
            except Exception:
                tags = [t.strip() for t in tags_raw.split(",") if t.strip()]

    is_video = ext in ALLOWED_VIDEO_EXTS
    is_image = ext in ALLOWED_IMAGE_EXTS

    if not is_video and not is_image:
        raise UnsupportedMediaError(
            f"Unsupported file format '{ext}'. Allowed video: MP4, MOV, WEBM. Allowed image: PNG, JPG, WEBP."
        )

    # Save to temp file and measure size
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        file_bytes = await uploaded_file.read()
        if len(file_bytes) > MAX_VIDEO_SIZE:
            os.remove(tmp_path)
            raise MediaTooLargeError(f"Uploaded file exceeds maximum limit of 200MB ({len(file_bytes)} bytes).")
        tmp.write(file_bytes)

    try:
        probe = _probe_media(tmp_path)
        format_info = probe.get("format", {})
        streams = probe.get("streams", [])

        width: Optional[int] = None
        height: Optional[int] = None
        duration_sec: Optional[float] = None
        has_audio = False

        # Extract dimensions & streams
        video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
        audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

        if audio_stream:
            has_audio = True

        if video_stream:
            width = int(video_stream.get("width") or 0) or None
            height = int(video_stream.get("height") or 0) or None

        raw_dur = format_info.get("duration")
        if raw_dur:
            try:
                duration_sec = float(raw_dur)
            except (ValueError, TypeError):
                duration_sec = None

        if is_video:
            kind = "video"
            if duration_sec and duration_sec > MAX_VIDEO_DURATION:
                raise InvalidPlacementError(
                    f"Video ad duration of {duration_sec:.1f}s exceeds the 60s limit."
                )
        else:
            kind = "image"
            duration_sec = None

        asset_id = uuid.uuid4()
        storage_key = f"ad_assets/{asset_id}/asset{ext}"
        thumb_key = f"ad_assets/{asset_id}/thumb.jpg"

        # Generate thumbnail
        thumb_bytes: Optional[bytes] = None
        if is_video:
            thumb_tmp = f"{tmp_path}_thumb.jpg"
            seek_pos = min(0.5, (duration_sec or 1.0) / 2.0)
            cmd = [
                "ffmpeg", "-y", "-ss", f"{seek_pos:.2f}",
                "-i", tmp_path, "-vframes", "1",
                "-vf", "scale=640:-2", "-q:v", "3",
                thumb_tmp,
            ]
            try:
                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                if os.path.exists(thumb_tmp):
                    with open(thumb_tmp, "rb") as tf:
                        thumb_bytes = tf.read()
                    os.remove(thumb_tmp)
            except Exception as e:
                logger.warning("Could not generate video thumbnail: %s", e)
        else:
            try:
                img = Image.open(tmp_path)
                img.thumbnail((640, 640))
                # Convert RGBA to RGB for JPEG thumb if needed
                if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                    bg = Image.new("RGB", img.size, (30, 30, 30))
                    bg.paste(img, mask=img.split()[3])
                    img = bg
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                thumb_bytes = buf.getvalue()
            except Exception as e:
                logger.warning("Could not generate image thumbnail: %s", e)

        # Upload files to MinIO
        content_mime = uploaded_file.content_type or ("video/mp4" if is_video else "image/png")
        storage.upload_file(storage_key, file_bytes, content_type=content_mime)

        if thumb_bytes:
            storage.upload_file(thumb_key, thumb_bytes, content_type="image/jpeg")
        else:
            thumb_key = None

        asset = AdAsset(
            id=asset_id,
            user_id=current_user.id,
            name=str(name),
            kind=kind,
            storage_key=storage_key,
            thumbnail_key=thumb_key,
            duration_sec=duration_sec,
            width=width,
            height=height,
            has_audio=has_audio,
            file_size=len(file_bytes),
            text_config=None,
            tags=tags,
            status="ready",
            usage_count=0,
        )
        db.add(asset)
        await db.commit()
        await db.refresh(asset)

        await publish_user_event_async(
            current_user.id, "ad_asset.ready", {"ad_asset_id": str(asset.id)}
        )
        return _build_asset_response(asset)

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router.patch("/{id}", response_model=AdAssetResponse)
async def update_ad_asset(
    id: uuid.UUID,
    payload: AdAssetUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdAssetResponse:
    """Update name, tags, or re-render text ad configuration."""
    query = select(AdAsset).where(AdAsset.id == id, AdAsset.user_id == current_user.id)
    asset = (await db.execute(query)).scalar_one_or_none()

    if not asset:
        raise NotFoundError("Ad asset not found.")

    if payload.name is not None:
        asset.name = payload.name

    if payload.tags is not None:
        asset.tags = payload.tags

    if asset.kind == "text" and payload.text_config is not None:
        png_bytes, width, height = render_text_ad_png(
            text=payload.text_config.text,
            font_name=payload.text_config.font,
            font_size=payload.text_config.size,
            text_color=payload.text_config.color,
            stroke_color=payload.text_config.stroke,
            bg_color=payload.text_config.bg,
            bg_opacity=payload.text_config.bg_opacity if payload.text_config.bg_opacity is not None else 0.8,
        )
        storage_key = f"ad_assets/{asset.id}/text.png"
        storage.upload_file(storage_key, png_bytes, content_type="image/png")

        asset.storage_key = storage_key
        asset.thumbnail_key = storage_key
        asset.width = width
        asset.height = height
        asset.file_size = len(png_bytes)
        asset.text_config = payload.text_config.model_dump()

    await db.commit()
    await db.refresh(asset)
    return _build_asset_response(asset)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_ad_asset(
    id: uuid.UUID,
    force: bool = Query(False, description="Force delete and remove placements referencing this asset"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Delete an ad asset.
    If the asset is in use, returns 409 in_use unless ?force=true.
    """
    query = select(AdAsset).where(AdAsset.id == id, AdAsset.user_id == current_user.id)
    asset = (await db.execute(query)).scalar_one_or_none()

    if not asset:
        raise NotFoundError("Ad asset not found.")

    # Check usage in user's clips
    asset_id_str = str(id)
    clips_query = select(Clip).where(Clip.user_id == current_user.id)
    clips = (await db.execute(clips_query)).scalars().all()

    referencing_clips = []
    for c in clips:
        edit_state = c.edit_state or {}
        ads = edit_state.get("ads", [])
        if any(str(p.get("ad_asset_id")) == asset_id_str for p in ads):
            referencing_clips.append(c)

    # Check usage in user's ad templates
    templates_query = select(AdTemplate).where(AdTemplate.user_id == current_user.id)
    templates = (await db.execute(templates_query)).scalars().all()

    referencing_templates = []
    for t in templates:
        placements = t.placements or []
        if any(str(p.get("ad_asset_id")) == asset_id_str for p in placements):
            referencing_templates.append(t)

    clip_count = len(referencing_clips)
    template_count = len(referencing_templates)

    if (clip_count > 0 or template_count > 0) and not force:
        raise InUseError(
            message=f"Ad asset is referenced by {clip_count} clip(s) and {template_count} template(s). Use ?force=true to remove them.",
            details={"clip_count": clip_count, "template_count": template_count},
        )

    # If force, clean up placements from clips and templates
    if force:
        for c in referencing_clips:
            edit_state = dict(c.edit_state or {})
            existing_ads = edit_state.get("ads", [])
            edit_state["ads"] = [p for p in existing_ads if str(p.get("ad_asset_id")) != asset_id_str]
            c.edit_state = edit_state
            c.version += 1

        for t in referencing_templates:
            existing_placements = t.placements or []
            t.placements = [p for p in existing_placements if str(p.get("ad_asset_id")) != asset_id_str]

    # Delete MinIO objects
    if asset.storage_key:
        try:
            storage.delete_file(asset.storage_key)
        except Exception:
            pass

    if asset.thumbnail_key and asset.thumbnail_key != asset.storage_key:
        try:
            storage.delete_file(asset.thumbnail_key)
        except Exception:
            pass

    await db.delete(asset)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{id}/preview")
async def preview_ad_asset(
    id: uuid.UUID,
    request: Request,
    range: Optional[str] = Header(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Stream ad asset preview with HTTP Range support for video.
    """
    query = select(AdAsset).where(AdAsset.id == id, AdAsset.user_id == current_user.id)
    asset = (await db.execute(query)).scalar_one_or_none()

    if not asset or not asset.storage_key:
        raise NotFoundError("Ad asset or media file not found.")

    stat = storage.stat_file(asset.storage_key)
    file_size = stat.size
    content_type = stat.content_type or ("video/mp4" if asset.kind == "video" else "image/png")

    # If Range header requested for video
    if range and asset.kind == "video":
        range_match = re.match(r"bytes=(\d+)-(\d*)", range)
        if range_match:
            start_offset = int(range_match.group(1))
            end_offset = int(range_match.group(2)) if range_match.group(2) else file_size - 1

            if start_offset >= file_size:
                return Response(
                    status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                    headers={"Content-Range": f"bytes */{file_size}"},
                )

            end_offset = min(end_offset, file_size - 1)
            chunk_length = end_offset - start_offset + 1

            stream = storage.get_file_stream(asset.storage_key, offset=start_offset, length=chunk_length)

            def iter_chunk():
                try:
                    for chunk in stream.stream(32 * 1024):
                        yield chunk
                finally:
                    stream.close()
                    stream.release_conn()

            return StreamingResponse(
                iter_chunk(),
                status_code=status.HTTP_206_PARTIAL_CONTENT,
                headers={
                    "Content-Range": f"bytes {start_offset}-{end_offset}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(chunk_length),
                    "Content-Type": content_type,
                },
            )

    # Full content response
    stream = storage.get_file_stream(asset.storage_key)

    def iter_file():
        try:
            for chunk in stream.stream(32 * 1024):
                yield chunk
        finally:
            stream.close()
            stream.release_conn()

    return StreamingResponse(
        iter_file(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )
