"""
ClipForge Worker — Batch Export Orchestrator & ZIP Packaging (Phase 6).

Executes batch render items with concurrency limits, aggregates progress,
publishes SSE events, and streams finished MP4s into a MinIO ZIP bundle.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import io
import json
import logging
import os
import shutil
import tempfile
from typing import Any, Dict, List
import uuid
import zipfile

import redis.asyncio as aioredis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.batch import Batch, BatchItem
from app.models.clip import Clip
from app.models.render import Render
from app.render.graph_builder import sanitize_filename
from app.render.runner import RenderRunner
from app.utils.storage import download_file, get_minio_client, upload_file

logger = logging.getLogger(__name__)

CONCURRENCY_LIMIT = 2


async def _publish_sse(user_id: str, event_type: str, data: Dict[str, Any]) -> None:
    """Publish SSE event to user's Redis pub/sub channel."""
    try:
        r = aioredis.from_url(settings.redis_url)
        channel = f"events:user:{user_id}"
        payload = json.dumps({"event": event_type, "data": data})
        await r.publish(channel, payload)
        await r.aclose()
    except Exception as exc:
        logger.warning("Failed to publish SSE event %s: %s", event_type, exc)


async def _process_batch_item(
    item_id: uuid.UUID,
    render_id: uuid.UUID,
    user_id_str: str,
    semaphore: asyncio.Semaphore,
) -> bool:
    """Render a single batch item governed by user concurrency limit."""
    async with semaphore:
        async with AsyncSessionLocal() as session:
            # Mark item rendering
            await session.execute(
                update(BatchItem)
                .where(BatchItem.id == item_id)
                .values(status="rendering")
            )
            await session.commit()

        try:
            runner = RenderRunner(str(render_id))
            result = await runner.execute()
            success = result.get("status") == "ready"

            async with AsyncSessionLocal() as session:
                await session.execute(
                    update(BatchItem)
                    .where(BatchItem.id == item_id)
                    .values(
                        status="completed" if success else "failed",
                        error_message=None if success else "Render failed",
                    )
                )
                await session.commit()
            return success
        except Exception as exc:
            logger.exception("Batch item %s failed: %s", item_id, exc)
            async with AsyncSessionLocal() as session:
                await session.execute(
                    update(BatchItem)
                    .where(BatchItem.id == item_id)
                    .values(status="failed", error_message=str(exc))
                )
                await session.commit()
            return False


async def run_batch_pipeline(batch_id_str: str) -> Dict[str, Any]:
    """Async orchestrator for a batch export job."""
    batch_uuid = uuid.UUID(batch_id_str)

    async with AsyncSessionLocal() as session:
        query = select(Batch).where(Batch.id == batch_uuid)
        batch = (await session.execute(query)).scalar_one_or_none()
        if not batch:
            logger.error("Batch %s not found.", batch_id_str)
            return {"status": "not_found"}

        user_id_str = str(batch.user_id)
        batch.status = "running"
        await session.commit()

        # Query batch items and their render IDs
        items_query = select(BatchItem).where(BatchItem.batch_id == batch_uuid)
        items = (await session.execute(items_query)).scalars().all()
        item_tuples = [(it.id, it.render_id) for it in items if it.render_id and it.status != "completed"]

    total = len(items)
    semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

    # Process items concurrently within the limit
    tasks = [
        _process_batch_item(item_id, render_id, user_id_str, semaphore)
        for item_id, render_id in item_tuples
    ]

    for coro in asyncio.as_completed(tasks):
        await coro
        # Update and publish progress after each item finishes
        async with AsyncSessionLocal() as session:
            refreshed_items = (
                await session.execute(select(BatchItem).where(BatchItem.batch_id == batch_uuid))
            ).scalars().all()
            completed = sum(1 for it in refreshed_items if it.status == "completed")
            failed = sum(1 for it in refreshed_items if it.status == "failed")

        await _publish_sse(
            user_id_str,
            "batch.progress",
            {
                "batch_id": batch_id_str,
                "completed": completed,
                "failed": failed,
                "total": total,
            },
        )

    # All items have concluded: aggregate terminal status
    async with AsyncSessionLocal() as session:
        final_items = (
            await session.execute(
                select(BatchItem, Clip, Render)
                .join(Clip, BatchItem.clip_id == Clip.id)
                .outerjoin(Render, BatchItem.render_id == Render.id)
                .where(BatchItem.batch_id == batch_uuid)
            )
        ).all()

        completed_items = [it for it in final_items if it[0].status == "completed"]
        failed_items = [it for it in final_items if it[0].status == "failed"]

        if len(completed_items) == total and total > 0:
            final_status = "completed"
        elif len(completed_items) > 0:
            final_status = "completed_with_errors"
        else:
            final_status = "failed"

        # If at least one item completed, package into a streaming ZIP bundle
        zip_key: str | None = None
        if completed_items:
            minio_client = get_minio_client()
            temp_zip_dir = tempfile.mkdtemp(prefix=f"clipforge_zip_{batch_id_str[:8]}_")
            zip_local_path = os.path.join(temp_zip_dir, "bundle.zip")

            try:
                with zipfile.ZipFile(zip_local_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_out:
                    used_filenames = set()
                    for b_item, clip, render in completed_items:
                        if render and render.output_key:
                            # Download output MP4 to temp dir
                            mp4_name = sanitize_filename(clip.title)
                            base_name = os.path.splitext(mp4_name)[0]
                            final_name = f"{base_name}_{str(clip.id)[:6]}.mp4"

                            tmp_mp4 = os.path.join(temp_zip_dir, final_name)
                            try:
                                download_file(
                                    minio_client,
                                    settings.minio_bucket,
                                    render.output_key,
                                    tmp_mp4,
                                )
                                if os.path.exists(tmp_mp4):
                                    zip_out.write(tmp_mp4, arcname=final_name)
                                    os.remove(tmp_mp4)
                            except Exception as dl_err:
                                logger.warning("Could not add render %s to zip: %s", render.id, dl_err)

                if os.path.exists(zip_local_path) and os.path.getsize(zip_local_path) > 0:
                    zip_key = f"batches/{batch_id_str}/bundle.zip"
                    upload_file(
                        minio_client,
                        settings.minio_bucket,
                        zip_key,
                        zip_local_path,
                        content_type="application/zip",
                    )
            finally:
                shutil.rmtree(temp_zip_dir, ignore_errors=True)

        # Update batch record
        await session.execute(
            update(Batch)
            .where(Batch.id == batch_uuid)
            .values(
                status=final_status,
                zip_key=zip_key,
                finished_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()

    # Publish batch completed event
    await _publish_sse(
        user_id_str,
        "batch.completed",
        {"batch_id": batch_id_str, "status": final_status},
    )

    return {"status": final_status, "zip_key": zip_key}


@celery_app.task(name="batch.process_batch", bind=True)
def process_batch_task(self: Any, batch_id: str, **kwargs: Any) -> Dict[str, Any]:
    """Celery entrypoint for processing an export batch."""
    logger.info("Starting batch processing task for batch_id=%s", batch_id)
    return asyncio.run(run_batch_pipeline(batch_id))
