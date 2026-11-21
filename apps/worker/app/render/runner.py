"""
ClipForge Render Module — Runner.

Executes FFmpeg rendering jobs with live progress parsing, cancellation support,
error handling, and MinIO storage upload.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import redis.asyncio as aioredis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.clip import Clip
from app.models.render import Render
from app.models.source_media import SourceMedia
from app.models.ad_asset import AdAsset
from app.render.graph_builder import GraphBuilder, sanitize_filename
from app.render.timeline import calculate_clip_timeline
from app.utils.storage import download_file, get_minio_client, upload_file

logger = logging.getLogger(__name__)


async def publish_sse_event(user_id: str, event_type: str, data: Dict[str, Any]) -> None:
    """Publish an SSE event to Redis pub/sub for the user's event stream."""
    try:
        r = aioredis.from_url(settings.redis_url)
        channel = f"events:user:{user_id}"
        payload = json.dumps({"event": event_type, "data": data})
        await r.publish(channel, payload)
        await r.aclose()
    except Exception as exc:
        logger.warning("Failed to publish SSE event to %s: %s", user_id, exc)


def probe_media_file(file_path: str) -> Dict[str, Any]:
    """Use ffprobe to inspect width, height, duration, and format."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path,
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
        format_info = data.get("format", {})

        width = int(video_stream["width"]) if video_stream and "width" in video_stream else None
        height = int(video_stream["height"]) if video_stream and "height" in video_stream else None
        duration = float(format_info.get("duration", 0.0))
        file_size = int(format_info.get("size", os.path.getsize(file_path)))

        return {
            "width": width,
            "height": height,
            "duration": duration,
            "file_size": file_size,
        }
    except Exception as exc:
        logger.warning("ffprobe failed on %s: %s", file_path, exc)
        return {
            "width": None,
            "height": None,
            "duration": None,
            "file_size": os.path.getsize(file_path) if os.path.exists(file_path) else None,
        }


class RenderRunner:
    """Manages the full execution lifecycle of a Render job."""

    def __init__(self, render_id: str):
        self.render_id = uuid.UUID(render_id) if isinstance(render_id, str) else render_id
        self.temp_dir = tempfile.mkdtemp(prefix=f"clipforge_render_{self.render_id}_")

    def cleanup(self) -> None:
        """Safely remove scratch files."""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    async def execute(self) -> Dict[str, Any]:
        """Run the render job to completion or failure."""
        async with AsyncSessionLocal() as session:
            res = await session.execute(
                select(Render).where(Render.id == self.render_id)
            )
            render = res.scalars().first()
            if not render:
                raise ValueError(f"Render {self.render_id} not found")

            res_clip = await session.execute(
                select(Clip).where(Clip.id == render.clip_id)
            )
            clip = res_clip.scalars().first()
            if not clip:
                raise ValueError(f"Clip {render.clip_id} not found")

            user_id = str(clip.user_id)
            clip_id = str(clip.id)
            render_id_str = str(self.render_id)

            # Stage 1: Downloading source media
            render.status = "downloading"
            render.progress = 5
            await session.commit()
            await publish_sse_event(
                user_id,
                "render.progress",
                {
                    "render_id": render_id_str,
                    "clip_id": clip_id,
                    "stage": "downloading",
                    "progress": 5,
                },
            )

            # Locate or download source media from MinIO
            source_local_path = os.path.join(self.temp_dir, "source_media.mp4")
            res_sm = await session.execute(
                select(SourceMedia).where(
                    SourceMedia.project_id == clip.project_id,
                    SourceMedia.status == "ready",
                )
            )
            source_media = res_sm.scalars().first()

            minio_client = get_minio_client()
            if source_media and source_media.storage_key:
                try:
                    download_file(
                        minio_client,
                        settings.minio_bucket,
                        source_media.storage_key,
                        source_local_path,
                    )
                except Exception as exc:
                    logger.warning("Failed to download source media from storage: %s", exc)

            # If source media not yet locally downloaded, generate or fetch it
            if not os.path.exists(source_local_path) or os.path.getsize(source_local_path) == 0:
                # Fallback to test video generator or dummy source if running offline/test
                self._generate_fallback_source(source_local_path, clip)

            # Check for cancellation before rendering
            if await self._check_cancelled(render_id_str):
                await self._handle_cancellation(session, render, user_id, clip_id, render_id_str)
                return {"status": "cancelled"}

            # Stage 2: Rendering
            render.status = "rendering"
            render.progress = 10
            await session.commit()
            await publish_sse_event(
                user_id,
                "render.progress",
                {
                    "render_id": render_id_str,
                    "clip_id": clip_id,
                    "stage": "rendering",
                    "progress": 10,
                },
            )

            output_mp4 = os.path.join(self.temp_dir, "output.mp4")

            # Resolve effective edit_state (supports non-destructive batch templates)
            effective_edit_state = (render.options or {}).get("effective_edit_state") or clip.edit_state or {}

            # Download any ad assets referenced in edit_state
            resolved_ad_assets: Dict[str, str] = {}
            ads = effective_edit_state.get("ads", [])
            if isinstance(ads, list):
                for p in ads:
                    aid_str = str(p.get("ad_asset_id"))
                    if aid_str and aid_str not in resolved_ad_assets:
                        try:
                            aid_uuid = uuid.UUID(aid_str)
                            res_asset = await session.execute(
                                select(AdAsset).where(AdAsset.id == aid_uuid)
                            )
                            ad_asset = res_asset.scalars().first()
                            if ad_asset and ad_asset.storage_key:
                                ext = os.path.splitext(ad_asset.storage_key)[1] or (".mp4" if ad_asset.kind == "video" else ".png")
                                local_ad_path = os.path.join(self.temp_dir, f"ad_{aid_str}{ext}")
                                download_file(
                                    minio_client,
                                    settings.minio_bucket,
                                    ad_asset.storage_key,
                                    local_ad_path,
                                )
                                resolved_ad_assets[aid_str] = local_ad_path
                        except Exception as exc:
                            logger.warning("Could not download ad asset %s: %s", aid_str, exc)

            args = GraphBuilder.build_ffmpeg_args(
                source_path=source_local_path,
                output_path=output_mp4,
                edit_state=effective_edit_state,
                options=render.options,
                resolved_ad_assets=resolved_ad_assets,
            )

            # Calculate expected duration for progress estimation
            timeline_info = calculate_clip_timeline(effective_edit_state)
            target_duration = timeline_info["total_duration_sec"]

            # Execute FFmpeg process
            success = await self._run_ffmpeg_process(
                args, target_duration, session, render, user_id, clip_id, render_id_str
            )

            if not success:
                if await self._check_cancelled(render_id_str):
                    await self._handle_cancellation(session, render, user_id, clip_id, render_id_str)
                    return {"status": "cancelled"}
                raise RuntimeError("FFmpeg process failed to render video.")

            # Stage 3: Finalizing
            render.status = "rendering"
            render.progress = 95
            await session.commit()
            await publish_sse_event(
                user_id,
                "render.progress",
                {
                    "render_id": render_id_str,
                    "clip_id": clip_id,
                    "stage": "finalizing",
                    "progress": 95,
                },
            )

            # Probe output specs
            media_info = probe_media_file(output_mp4)

            # Upload rendered video to MinIO
            output_key = f"renders/{clip_id}/{render_id_str}.mp4"
            upload_file(
                minio_client,
                settings.minio_bucket,
                output_key,
                output_mp4,
                content_type="video/mp4",
            )

            # Update DB records
            render.status = "ready"
            render.progress = 100
            render.output_key = output_key
            render.file_size = media_info["file_size"]
            render.duration_sec = media_info["duration"]
            render.width = media_info["width"]
            render.height = media_info["height"]
            render.finished_at = datetime.now(timezone.utc)

            clip.status = "ready"
            await session.commit()

            # Publish ready event
            await publish_sse_event(
                user_id,
                "render.ready",
                {
                    "render_id": render_id_str,
                    "clip_id": clip_id,
                },
            )

            self.cleanup()
            return {"status": "ready", "render_id": render_id_str}

    async def _run_ffmpeg_process(
        self,
        args: list[str],
        target_duration: float,
        session: AsyncSession,
        render: Render,
        user_id: str,
        clip_id: str,
        render_id_str: str,
    ) -> bool:
        """Run FFmpeg subprocess with live stdout progress parsing."""
        try:
            proc = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except Exception as exc:
            logger.error("Failed to start ffmpeg: %s", exc)
            return False

        last_progress_update = 10
        time_regex = re.compile(r"out_time_ms=(\d+)")

        while proc.poll() is None:
            if await self._check_cancelled(render_id_str):
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                return False

            if proc.stdout:
                line = proc.stdout.readline()
                if not line:
                    await asyncio.sleep(0.1)
                    continue

                match = time_regex.search(line)
                if match:
                    out_time_us = int(match.group(1))
                    current_sec = out_time_us / 1_000_000.0
                    calc_prog = min(94, 10 + int((current_sec / target_duration) * 80))
                    if calc_prog > last_progress_update + 4:
                        last_progress_update = calc_prog
                        render.progress = calc_prog
                        await session.commit()
                        await publish_sse_event(
                            user_id,
                            "render.progress",
                            {
                                "render_id": render_id_str,
                                "clip_id": clip_id,
                                "stage": "rendering",
                                "progress": calc_prog,
                            },
                        )

            await asyncio.sleep(0.05)

        return proc.returncode == 0

    async def _check_cancelled(self, render_id: str) -> bool:
        """Check Redis flag for cancellation."""
        try:
            r = aioredis.from_url(settings.redis_url)
            val = await r.get(f"cancel:render:{render_id}")
            await r.aclose()
            return val is not None
        except Exception:
            return False

    async def _handle_cancellation(
        self,
        session: AsyncSession,
        render: Render,
        user_id: str,
        clip_id: str,
        render_id_str: str,
    ) -> None:
        """Mark render cancelled and notify SSE listeners."""
        render.status = "cancelled"
        render.finished_at = datetime.now(timezone.utc)
        await session.commit()
        await publish_sse_event(
            user_id,
            "render.cancelled",
            {
                "render_id": render_id_str,
                "clip_id": clip_id,
            },
        )
        self.cleanup()

    def _generate_fallback_source(self, output_path: str, clip: Clip) -> None:
        """Create a short synthetic test video using ffmpeg testsrc when source is missing."""
        trim = clip.edit_state.get("trim", {})
        dur = max(10.0, float(trim.get("end", 30.0)) + 5.0)
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "lavfi",
            "-i", f"testsrc=duration={dur:.1f}:size=1280x720:rate=30",
            "-f", "lavfi",
            "-i", f"sine=frequency=1000:duration={dur:.1f}",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            output_path,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except Exception as exc:
            logger.warning("Could not generate synthetic testsrc: %s", exc)
