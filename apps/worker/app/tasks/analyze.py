"""
ClipForge Worker — Video Moment Analysis Pipeline Task.

Orchestrates:
1. Audio extraction via MediaFetcher (yt-dlp / MinIO)
2. Speech-to-text via faster-whisper (with global offsets & chunking)
3. Signal extraction (audio energy, laughter, screams, silence, sentiment, chat)
4. Smoothing & scoring
5. Peak detection, boundary snapping, category balancing, and AI titles
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

import redis
from sqlalchemy import delete, select

from app.celery_app import celery_app
from app.config import settings
from app.database import async_session_factory
from app.models.analysis import Analysis, Moment, SignalWindow
from app.models.project import Project
from app.models.transcript import TranscriptSegment
from app.services.media_fetcher import MediaFetchError, YtDlpMediaFetcher, chunk_audio_file
from app.services.moment_selector import MomentSelector
from app.services.scoring import MomentScorer, load_scoring_weights
from app.services.signal_extractor import SignalExtractor
from app.services.transcriber import FasterWhisperTranscriber

logger = logging.getLogger(__name__)


def publish_analysis_event(analysis_id: str, payload: Dict[str, Any]) -> None:
    """Publish real-time progress update to Redis pub/sub channel."""
    try:
        r = redis.from_url(settings.redis_url)
        channel = f"analysis_events:{analysis_id}"
        json_data = json.dumps(payload)
        r.publish(channel, json_data)
        # Cache current progress
        r.set(f"analysis_latest:{analysis_id}", json_data, ex=86400)
    except Exception as exc:
        logger.warning(f"Failed to publish Redis event for analysis {analysis_id}: {exc}")


def check_is_cancelled(analysis_id: str) -> bool:
    """Check Redis cancel flag to allow early termination."""
    try:
        r = redis.from_url(settings.redis_url)
        return bool(r.get(f"analysis_cancel:{analysis_id}"))
    except Exception:
        return False


async def _async_run_analysis_pipeline(analysis_id_str: str) -> Dict[str, Any]:
    analysis_id = uuid.UUID(analysis_id_str)
    temp_dir = tempfile.mkdtemp(prefix=f"clipforge_{analysis_id_str}_")

    try:
        # Load analysis and parent project
        async with async_session_factory() as session:
            res = await session.execute(
                select(Analysis).where(Analysis.id == analysis_id)
            )
            analysis = res.scalars().first()
            if not analysis:
                return {"status": "error", "message": "Analysis not found"}

            p_res = await session.execute(
                select(Project).where(Project.id == analysis.project_id)
            )
            project = p_res.scalars().first()
            if not project:
                return {"status": "error", "message": "Project not found"}

            source_url = project.source_url or (f"upload://{project.raw_video_key}" if project.raw_video_key else "")
            mode = analysis.mode
            min_clip_sec = analysis.min_clip_seconds
            max_clip_sec = analysis.max_clip_seconds
            max_clips = analysis.max_clips
            language = analysis.language or "auto"

            # Take scoring snapshot
            config_weights = load_scoring_weights()
            analysis.config_snapshot = config_weights
            await session.commit()

        # =====================================================================
        # STAGE 1: Media Download (Audio Only - 16kHz mono WAV)
        # =====================================================================
        if check_is_cancelled(analysis_id_str):
            return _handle_cancelled(analysis_id)

        await _update_status(analysis_id, "downloading", "downloading", 10, "Extracting audio track from stream...")
        publish_analysis_event(analysis_id_str, {
            "type": "progress", "analysis_id": analysis_id_str, "stage": "downloading", "progress": 15,
            "message": "Downloading audio stream (16 kHz mono)..."
        })

        fetcher = YtDlpMediaFetcher()
        audio_info = await fetcher.fetch_audio(source_url, temp_dir)

        await _update_status(analysis_id, "downloading", "downloading", 30, "Audio extracted successfully.")
        publish_analysis_event(analysis_id_str, {
            "type": "progress", "analysis_id": analysis_id_str, "stage": "downloading", "progress": 30,
            "message": f"Audio extracted ({int(audio_info.duration_seconds)}s)."
        })

        # =====================================================================
        # STAGE 2: Speech-to-Text Transcription
        # =====================================================================
        if check_is_cancelled(analysis_id_str):
            return _handle_cancelled(analysis_id)

        await _update_status(analysis_id, "transcribing", "transcribing", 35, "Transcribing speech with Whisper...")
        publish_analysis_event(analysis_id_str, {
            "type": "progress", "analysis_id": analysis_id_str, "stage": "transcribing", "progress": 35,
            "message": "Initializing faster-whisper model..."
        })

        transcriber = FasterWhisperTranscriber()
        # Chunk long audio into 10-minute segments with 5s overlap for memory safety
        chunk_dir = os.path.join(temp_dir, "chunks")
        chunks = chunk_audio_file(
            audio_info.wav_path,
            chunk_dir,
            chunk_duration_sec=600.0,
            overlap_sec=5.0,
            total_duration_sec=audio_info.duration_seconds,
        )

        all_transcript_items = []
        num_chunks = len(chunks)

        for idx, chunk in enumerate(chunks):
            if check_is_cancelled(analysis_id_str):
                return _handle_cancelled(analysis_id)

            def on_chunk_progress(frac: float):
                overall_progress = int(35 + (frac / num_chunks) * 30)
                publish_analysis_event(analysis_id_str, {
                    "type": "progress", "analysis_id": analysis_id_str, "stage": "transcribing",
                    "progress": overall_progress,
                    "message": f"Transcribing audio chunk {idx + 1}/{num_chunks}..."
                })

            chunk_items = transcriber.transcribe(
                chunk.file_path,
                language=language,
                global_offset_sec=chunk.start_sec,
                progress_callback=on_chunk_progress,
            )
            all_transcript_items.extend(chunk_items)

        # Save transcript segments to database
        async with async_session_factory() as session:
            for item in all_transcript_items:
                seg = TranscriptSegment(
                    analysis_id=analysis_id,
                    project_id=project.id,
                    text=item.text,
                    start_sec=item.start_sec,
                    end_sec=item.end_sec,
                    avg_logprob=item.avg_logprob,
                    confidence=1.0,
                )
                session.add(seg)
            await session.commit()

        publish_analysis_event(analysis_id_str, {
            "type": "progress", "analysis_id": analysis_id_str, "stage": "transcribing", "progress": 65,
            "message": f"Transcribed {len(all_transcript_items)} speech segments."
        })

        # =====================================================================
        # STAGE 3: Signal Extraction & Multi-Modal Scoring
        # =====================================================================
        if check_is_cancelled(analysis_id_str):
            return _handle_cancelled(analysis_id)

        await _update_status(analysis_id, "analyzing", "analyzing", 70, "Extracting audio and text signals...")
        publish_analysis_event(analysis_id_str, {
            "type": "progress", "analysis_id": analysis_id_str, "stage": "analyzing", "progress": 70,
            "message": "Computing audio RMS energy, laughter, screams, and sentiment..."
        })

        extractor = SignalExtractor(window_sec=5.0, hop_sec=2.5)
        raw_windows = extractor.extract_signals(
            audio_info.wav_path,
            all_transcript_items,
            total_duration_sec=audio_info.duration_seconds,
        )

        publish_analysis_event(analysis_id_str, {
            "type": "progress", "analysis_id": analysis_id_str, "stage": "analyzing", "progress": 80,
            "message": f"Extracted {len(raw_windows)} time windows. Scoring moments..."
        })

        # Score, smooth moving average, and normalize
        scorer = MomentScorer(config=config_weights)
        scored_windows = scorer.score_windows(raw_windows)

        # Save signal windows to database
        async with async_session_factory() as session:
            for w in scored_windows:
                sw = SignalWindow(
                    analysis_id=analysis_id,
                    start_sec=w.start_sec,
                    end_sec=w.end_sec,
                    audio_energy=w.audio_energy,
                    laughter_score=w.laughter_score,
                    scream_score=w.scream_score,
                    silence_score=w.silence_score,
                    chat_rate=w.chat_rate,
                    emote_score=w.emote_score,
                    sentiment_pos=w.sentiment_pos,
                    sentiment_neg=w.sentiment_neg,
                    funny_score=w.funny_score,
                    sad_score=w.sad_score,
                )
                session.add(sw)
            await session.commit()

        # =====================================================================
        # STAGE 4: Peak Detection, Boundary Snapping & AI Titles
        # =====================================================================
        if check_is_cancelled(analysis_id_str):
            return _handle_cancelled(analysis_id)

        publish_analysis_event(analysis_id_str, {
            "type": "progress", "analysis_id": analysis_id_str, "stage": "analyzing", "progress": 90,
            "message": "Detecting peaks and snapping boundaries to sentences..."
        })

        selector = MomentSelector(
            min_clip_seconds=min_clip_sec,
            max_clip_seconds=max_clip_sec,
            min_gap_seconds=30.0,
        )

        detected_moments = selector.select_moments(
            windows=scored_windows,
            transcript_segments=all_transcript_items,
            mode=mode,
            max_clips=max_clips,
            language=language if language != "auto" else (all_transcript_items[0].language if all_transcript_items else "en"),
        )

        # Save moments to database
        async with async_session_factory() as session:
            for m in detected_moments:
                db_m = Moment(
                    analysis_id=analysis_id,
                    start_sec=m.start_sec,
                    end_sec=m.end_sec,
                    category=m.category,
                    score=m.peak_score,
                    title=m.title,
                    reason=m.reason,
                    transcript_excerpt=m.transcript_excerpt,
                    signals_json=m.signals_summary,
                )
                session.add(db_m)

            # Mark analysis ready
            res = await session.execute(select(Analysis).where(Analysis.id == analysis_id))
            target_analysis = res.scalars().first()
            if target_analysis:
                target_analysis.status = "ready"
                target_analysis.stage = "ready"
                target_analysis.progress = 100
                target_analysis.finished_at = datetime.now(timezone.utc)
                target_analysis.error_message = None
            await session.commit()

        # Emit completion event
        publish_analysis_event(analysis_id_str, {
            "type": "finished",
            "analysis_id": analysis_id_str,
            "status": "ready",
            "progress": 100,
            "moments_count": len(detected_moments),
            "message": f"Analysis complete! Detected {len(detected_moments)} highlights.",
        })

        return {
            "status": "ready",
            "analysis_id": analysis_id_str,
            "moments_count": len(detected_moments),
        }

    except Exception as exc:
        err_msg = getattr(exc, "user_message", str(exc))
        logger.error(f"Analysis {analysis_id_str} failed: {err_msg}", exc_info=True)
        async with async_session_factory() as session:
            res = await session.execute(select(Analysis).where(Analysis.id == analysis_id))
            target = res.scalars().first()
            if target:
                target.status = "failed"
                target.error_message = err_msg
                await session.commit()

        publish_analysis_event(analysis_id_str, {
            "type": "failed",
            "analysis_id": analysis_id_str,
            "status": "failed",
            "error_message": err_msg,
        })
        return {"status": "failed", "error": err_msg}

    finally:
        # Clean up temporary audio files
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


async def _update_status(
    analysis_id: uuid.UUID, status: str, stage: str, progress: int, message: str
) -> None:
    async with async_session_factory() as session:
        res = await session.execute(select(Analysis).where(Analysis.id == analysis_id))
        a = res.scalars().first()
        if a:
            a.status = status
            a.stage = stage
            a.progress = progress
            await session.commit()


def _handle_cancelled(analysis_id: uuid.UUID) -> Dict[str, Any]:
    async def _async_cancel():
        async with async_session_factory() as session:
            res = await session.execute(select(Analysis).where(Analysis.id == analysis_id))
            a = res.scalars().first()
            if a:
                a.status = "cancelled"
                a.error_message = "Analysis cancelled by user."
                await session.commit()

    asyncio.run(_async_cancel())
    publish_analysis_event(str(analysis_id), {
        "type": "cancelled", "analysis_id": str(analysis_id), "status": "cancelled"
    })
    return {"status": "cancelled"}


@celery_app.task(name="analyze.pipeline", bind=True)
def run_analysis_pipeline(self, analysis_id: str) -> Dict[str, Any]:
    """Celery task entry point for analysis pipeline."""
    logger.info(f"Starting analysis pipeline task for ID {analysis_id}")
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, _async_run_analysis_pipeline(str(analysis_id))).result()
        else:
            return loop.run_until_complete(_async_run_analysis_pipeline(str(analysis_id)))
    except RuntimeError:
        return asyncio.run(_async_run_analysis_pipeline(str(analysis_id)))
