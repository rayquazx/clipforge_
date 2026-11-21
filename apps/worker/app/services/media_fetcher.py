"""
ClipForge Media Fetcher Service.

Extracts and downloads ONLY the audio track as 16 kHz mono WAV
using yt-dlp + ffmpeg for YouTube, Twitch VODs, Kick VODs, or MinIO uploads.
Includes chunking helpers for long streams (10-minute chunks with 5s overlap).
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator, List, Optional

from app.config import settings
from app.utils.storage import download_file, get_minio_client


class MediaFetchError(Exception):
    """User-facing media retrieval error."""

    def __init__(self, user_message: str, details: Optional[str] = None):
        super().__init__(user_message)
        self.user_message = user_message
        self.details = details


@dataclass
class AudioChunk:
    """Represents a time-bounded chunk of the extracted 16kHz audio."""
    chunk_index: int
    file_path: str
    start_sec: float
    end_sec: float
    is_last: bool


@dataclass
class ExtractedAudioInfo:
    """Result of audio extraction."""
    wav_path: str
    duration_seconds: float
    sample_rate: int = 16000
    channels: int = 1


class MediaFetcher(ABC):
    """Abstract interface for audio/media downloaders."""

    @abstractmethod
    async def fetch_audio(self, source_url: str, output_dir: str) -> ExtractedAudioInfo:
        """Download or extract audio track as 16 kHz mono WAV."""
        pass


class YtDlpMediaFetcher(MediaFetcher):
    """
    yt-dlp + ffmpeg audio extractor.
    Downloads highest-quality audio stream and converts directly to 16kHz mono WAV.
    """

    MAX_DURATION_SECONDS = 21600  # 6 hours

    async def fetch_audio(self, source_url: str, output_dir: str) -> ExtractedAudioInfo:
        os.makedirs(output_dir, exist_ok=True)
        wav_filename = "extracted_audio_16k.wav"
        output_wav = os.path.join(output_dir, wav_filename)

        # 1. Handle MinIO Direct Upload
        if source_url.startswith("upload://") or source_url.startswith("minio://"):
            s3_key = source_url.replace("upload://", "").replace("minio://", "")
            # If stored with raw_video_key path
            if not s3_key.startswith("raw/"):
                s3_key = f"raw/{s3_key}"

            raw_temp_path = os.path.join(output_dir, "uploaded_source_video")
            try:
                minio_client = get_minio_client()
                download_file(minio_client, settings.minio_bucket, s3_key, raw_temp_path)
            except Exception as exc:
                raise MediaFetchError(
                    f"Failed to retrieve uploaded video from storage: {exc}",
                    details=str(exc),
                )

            # Convert uploaded video to 16kHz mono WAV
            return self._convert_to_16k_mono_wav(raw_temp_path, output_wav)

        # 2. External platform (YouTube, Twitch, Kick) via yt-dlp
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--extract-audio",
            "--audio-format",
            "wav",
            "--audio-quality",
            "0",
            "--postprocessor-args",
            "-ar 16000 -ac 1",
            "--output",
            os.path.join(output_dir, "%(id)s.%(ext)s"),
            source_url,
        ]

        # Execute yt-dlp subprocess asynchronously
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            err_text = (stderr.decode("utf-8", errors="replace") + stdout.decode("utf-8", errors="replace")).lower()
            if "private" in err_text:
                raise MediaFetchError("This video is private and cannot be downloaded.")
            elif "subscriber" in err_text or "sub-only" in err_text:
                raise MediaFetchError("This Twitch VOD is subscriber-only.")
            elif "not found" in err_text or "deleted" in err_text or "404" in err_text:
                raise MediaFetchError("The video does not exist or has been removed from the platform.")
            elif "geo" in err_text or "country" in err_text or "blocked" in err_text:
                raise MediaFetchError("The video is geo-restricted or blocked in this region.")
            else:
                raise MediaFetchError(
                    "Failed to download audio from stream. Please ensure the link is a public video.",
                    details=err_text[:300],
                )

        # Locate the downloaded wav file
        downloaded_wav: Optional[str] = None
        for f in os.listdir(output_dir):
            if f.endswith(".wav"):
                downloaded_wav = os.path.join(output_dir, f)
                break

        if not downloaded_wav:
            raise MediaFetchError("yt-dlp completed but no WAV audio file was produced.")

        # Ensure exact 16kHz mono encoding with ffmpeg
        final_info = self._convert_to_16k_mono_wav(downloaded_wav, output_wav)
        return final_info

    def _convert_to_16k_mono_wav(self, input_file: str, output_wav: str) -> ExtractedAudioInfo:
        """Probe duration and transcode cleanly to 16kHz 16-bit mono WAV."""
        duration = self._probe_duration(input_file)
        if duration > self.MAX_DURATION_SECONDS:
            raise MediaFetchError(
                f"Video duration ({int(duration // 3600)}h) exceeds the maximum limit of 6 hours."
            )

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            input_file,
            "-vn",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            output_wav,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            raise MediaFetchError("FFmpeg audio conversion failed.")

        final_duration = self._probe_duration(output_wav) or duration
        return ExtractedAudioInfo(
            wav_path=output_wav,
            duration_seconds=final_duration,
            sample_rate=16000,
            channels=1,
        )

    def _probe_duration(self, file_path: str) -> float:
        """Probe audio duration in seconds using ffprobe."""
        try:
            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                file_path,
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
            if res.returncode == 0 and res.stdout.strip():
                return float(res.stdout.strip())
        except Exception:
            pass
        return 0.0


def chunk_audio_file(
    wav_path: str,
    output_dir: str,
    chunk_duration_sec: float = 600.0,  # 10 minutes
    overlap_sec: float = 5.0,
    total_duration_sec: Optional[float] = None,
) -> List[AudioChunk]:
    """
    Split a long WAV audio file into overlapping chunks for memory-safe processing.
    Returns list of AudioChunk records with exact start_sec and end_sec global offsets.
    """
    os.makedirs(output_dir, exist_ok=True)
    chunks: List[AudioChunk] = []

    if total_duration_sec is None or total_duration_sec <= 0:
        total_duration_sec = YtDlpMediaFetcher()._probe_duration(wav_path)

    # For short videos (< 12 minutes), avoid slicing and return single chunk
    if total_duration_sec <= (chunk_duration_sec + overlap_sec + 60.0):
        chunks.append(
            AudioChunk(
                chunk_index=0,
                file_path=wav_path,
                start_sec=0.0,
                end_sec=total_duration_sec,
                is_last=True,
            )
        )
        return chunks

    current_start = 0.0
    index = 0

    while current_start < total_duration_sec:
        current_end = min(total_duration_sec, current_start + chunk_duration_sec + overlap_sec)
        is_last = current_end >= total_duration_sec

        chunk_path = os.path.join(output_dir, f"chunk_{index:03d}.wav")
        duration = current_end - current_start

        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{current_start:.3f}",
            "-i",
            wav_path,
            "-t",
            f"{duration:.3f}",
            "-c",
            "copy",
            chunk_path,
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        chunks.append(
            AudioChunk(
                chunk_index=index,
                file_path=chunk_path,
                start_sec=current_start,
                end_sec=current_end,
                is_last=is_last,
            )
        )

        if is_last:
            break

        current_start += chunk_duration_sec
        index += 1

    return chunks


# ==============================================================================
# Phase 4 Source Media Caching, Lazy Downloading & Storage Cleanup
# ==============================================================================
# LEGAL NOTICE: ClipForge is intended only for video and stream content that you
# own or have explicit legal authorization to use. Always respect intellectual
# property rights and third-party platform Terms of Service.
# ==============================================================================

import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import delete, func, select
from app.database import AsyncSessionLocal
from app.models.project import Project
from app.models.render import Render
from app.models.source_media import SourceMedia
from app.render.runner import probe_media_file
import redis.asyncio as aioredis


class SourceUnavailableError(MediaFetchError):
    """Raised when source media cannot be retrieved (private, deleted, geo-blocked, etc.)."""
    pass


async def ensure_video(
    project_id: uuid.UUID | str,
    start_sec: Optional[float] = None,
    end_sec: Optional[float] = None,
    padding_sec: float = 15.0,
    max_resolution: str = "1080p",
) -> Tuple[SourceMedia, str]:
    """
    Ensure the source video (or requested time slice) is available in MinIO and cached locally.
    Uses Redis locking to prevent concurrent redundant downloads.
    """
    p_id = uuid.UUID(str(project_id))
    minio_client = get_minio_client()

    async with AsyncSessionLocal() as session:
        # 1. Check existing cached source_media in database
        stmt = select(SourceMedia).where(
            SourceMedia.project_id == p_id,
            SourceMedia.status == "ready",
        )
        res = await session.execute(stmt)
        candidates = res.scalars().all()

        # Check for full video or covering range
        for sm in candidates:
            if sm.covered_range is None:
                # Full video covers all ranges
                sm.last_used_at = datetime.now(timezone.utc)
                await session.commit()
                local_path = os.path.join(tempfile.gettempdir(), f"cf_src_{sm.id}.mp4")
                if not os.path.exists(local_path):
                    download_file(minio_client, settings.minio_bucket, sm.storage_key, local_path)
                return sm, local_path

            if start_sec is not None and end_sec is not None:
                c_start = sm.covered_range.get("start", 0.0)
                c_end = sm.covered_range.get("end", 0.0)
                if c_start <= start_sec and c_end >= end_sec:
                    sm.last_used_at = datetime.now(timezone.utc)
                    await session.commit()
                    local_path = os.path.join(tempfile.gettempdir(), f"cf_src_{sm.id}.mp4")
                    if not os.path.exists(local_path):
                        download_file(minio_client, settings.minio_bucket, sm.storage_key, local_path)
                    return sm, local_path

        # 2. Acquire Redis distributed lock
        r = aioredis.from_url(settings.redis_url)
        lock_key = f"lock:source_media:{p_id}"
        lock_acquired = False
        try:
            for _ in range(60):  # Wait up to 60 seconds
                lock_acquired = await r.set(lock_key, "1", nx=True, ex=600)
                if lock_acquired:
                    break
                await asyncio.sleep(1.0)
        except Exception:
            lock_acquired = True  # Proceed if Redis offline

        try:
            # Re-check if another worker finished it while waiting
            res = await session.execute(stmt)
            for sm in res.scalars().all():
                if sm.covered_range is None or (
                    start_sec is not None and end_sec is not None and
                    sm.covered_range.get("start", 0.0) <= start_sec and
                    sm.covered_range.get("end", 0.0) >= end_sec
                ):
                    sm.last_used_at = datetime.now(timezone.utc)
                    await session.commit()
                    local_path = os.path.join(tempfile.gettempdir(), f"cf_src_{sm.id}.mp4")
                    if not os.path.exists(local_path):
                        download_file(minio_client, settings.minio_bucket, sm.storage_key, local_path)
                    return sm, local_path

            # Fetch Project to get source URL / type
            p_res = await session.execute(select(Project).where(Project.id == p_id))
            project = p_res.scalars().first()
            if not project:
                raise MediaFetchError(f"Project {p_id} not found.")

            # Create new SourceMedia entry
            new_media_id = uuid.uuid4()
            temp_download_dir = tempfile.mkdtemp(prefix=f"cf_dl_{new_media_id}_")
            target_download_path = os.path.join(temp_download_dir, "downloaded.mp4")

            res_limit = "1080" if "1080" in max_resolution else "720"
            covered_range = None

            # Handle direct upload
            if project.source_type == "upload" or (project.source_url and project.source_url.startswith("upload://")):
                key = project.raw_video_key or project.source_url.replace("upload://", "").replace("minio://", "")
                download_file(minio_client, settings.minio_bucket, key, target_download_path)
            else:
                # External stream / video via yt-dlp
                format_opt = f"bestvideo[height<={res_limit}]+bestaudio/best[height<={res_limit}]/best"
                cmd = [
                    "yt-dlp",
                    "--no-playlist",
                    "-f", format_opt,
                    "--merge-output-format", "mp4",
                    "--output", target_download_path,
                ]

                # Attempt range download if start & end are specified
                if start_sec is not None and end_sec is not None:
                    req_start = max(0.0, start_sec - padding_sec)
                    req_end = end_sec + padding_sec
                    if project.duration_seconds:
                        req_end = min(float(project.duration_seconds), req_end)
                    range_cmd = list(cmd) + [
                        "--download-sections", f"*{req_start:.2f}-{req_end:.2f}",
                        "--force-keyframes-at-cuts",
                        project.source_url or "",
                    ]
                    try:
                        proc = await asyncio.create_subprocess_exec(
                            *range_cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        stdout, stderr = await proc.communicate()
                        if proc.returncode == 0 and os.path.exists(target_download_path):
                            covered_range = {"start": req_start, "end": req_end}
                    except Exception:
                        pass

                # If range download didn't produce file, fall back to full download
                if not os.path.exists(target_download_path):
                    full_cmd = list(cmd) + [project.source_url or ""]
                    proc = await asyncio.create_subprocess_exec(
                        *full_cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    stdout, stderr = await proc.communicate()
                    if proc.returncode != 0:
                        err_text = (stderr.decode("utf-8", errors="replace") + stdout.decode("utf-8", errors="replace")).lower()
                        if "private" in err_text:
                            raise SourceUnavailableError("This video is private and cannot be downloaded.")
                        elif "subscriber" in err_text or "sub-only" in err_text:
                            raise SourceUnavailableError("This video is subscriber-only.")
                        elif "not found" in err_text or "deleted" in err_text or "404" in err_text:
                            raise SourceUnavailableError("The video does not exist or has been removed from the platform.")
                        elif "geo" in err_text or "blocked" in err_text or "country" in err_text:
                            raise SourceUnavailableError("The video is geo-restricted or blocked in this region.")
                        else:
                            raise SourceUnavailableError(f"Failed to download source media: {err_text[:200]}")

            # Inspect media
            probe = probe_media_file(target_download_path)

            # Store in MinIO
            storage_key = f"source_media/{p_id}/{new_media_id}.mp4"
            upload_file(
                minio_client,
                settings.minio_bucket,
                storage_key,
                target_download_path,
                content_type="video/mp4",
            )

            # Record in source_media table
            source_media = SourceMedia(
                id=new_media_id,
                project_id=p_id,
                kind="video",
                storage_key=storage_key,
                status="ready",
                width=probe["width"],
                height=probe["height"],
                duration_sec=probe["duration"],
                format="mp4",
                covered_range=covered_range,
                last_used_at=datetime.now(timezone.utc),
            )
            session.add(source_media)
            await session.commit()
            await session.refresh(source_media)

            return source_media, target_download_path

        finally:
            if lock_acquired:
                try:
                    await r.delete(lock_key)
                    await r.aclose()
                except Exception:
                    pass


async def cleanup_unused_source_media(retention_days: int = 7) -> int:
    """
    Deletes cached source media unused for N days.
    Never deletes media belonging to projects with active jobs (queued, downloading, rendering).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    minio_client = get_minio_client()
    deleted_count = 0

    async with AsyncSessionLocal() as session:
        # Find active project IDs
        active_renders_res = await session.execute(
            select(Clip.project_id)
            .join(Render, Render.clip_id == Clip.id)
            .where(Render.status.in_(["queued", "downloading", "rendering"]))
        )
        active_project_ids = set(active_renders_res.scalars().all())

        # Find stale media
        stale_res = await session.execute(
            select(SourceMedia).where(
                SourceMedia.last_used_at < cutoff,
                SourceMedia.project_id.not_in(active_project_ids) if active_project_ids else True,
            )
        )
        stale_media = stale_res.scalars().all()

        for sm in stale_media:
            try:
                minio_client.remove_object(settings.minio_bucket, sm.storage_key)
            except Exception as exc:
                logger.warning("Failed to remove MinIO object %s: %s", sm.storage_key, exc)

            await session.delete(sm)
            deleted_count += 1

        await session.commit()

    return deleted_count
