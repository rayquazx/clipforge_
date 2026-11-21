"""
ClipForge Worker — Metadata Fetch Task.

Fetches video metadata from Twitch, YouTube, or Kick, persists
the details to PostgreSQL, and broadcasts real-time status updates via Redis.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, Dict

import redis
from celery.exceptions import MaxRetriesExceededError
from sqlalchemy import select

from app.celery_app import celery_app
from app.config import settings
from app.database import async_session_factory
from app.models.project import Project
from app.services.metadata.base import MetadataProvider
from app.services.metadata.exceptions import (
    MetadataError,
    NotFoundError,
    PrivateVideoError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.services.metadata.factory import get_metadata_provider

logger = logging.getLogger(__name__)


def publish_project_event(project_id: str, event_data: Dict[str, Any]) -> None:
    """Publish a status event to Redis pub/sub channel."""
    try:
        r = redis.from_url(settings.redis_url)
        channel = f"project_events:{project_id}"
        payload = json.dumps(event_data)
        r.publish(channel, payload)
        # Also store the latest state in a Redis key with 24h expiration for late-connecting SSE clients
        r.set(f"project_latest:{project_id}", payload, ex=86400)
    except Exception as exc:
        logger.warning(f"Failed to publish Redis event for project {project_id}: {exc}")


async def _async_fetch_metadata(task_instance: Any, project_id_str: str) -> Dict[str, Any]:
    project_id = uuid.UUID(project_id_str)

    async with async_session_factory() as session:
        result = await session.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalars().first()
        if not project:
            logger.error(f"Project {project_id} not found in database.")
            return {"status": "error", "message": "Project not found"}

        # 1. Update status to fetching_metadata
        project.status = "fetching_metadata"
        project.error_message = None
        await session.commit()

        publish_project_event(
            project_id_str,
            {
                "type": "status_changed",
                "project_id": project_id_str,
                "status": "fetching_metadata",
            },
        )

        # 2. Call platform provider
        try:
            if not project.external_id:
                raise MetadataError("Project does not contain an external video ID.")

            provider: MetadataProvider = get_metadata_provider(project.source_type)
            metadata = await provider.fetch(project.external_id)

            # 3. Update project with fetched metadata and mark ready
            project.title = metadata.title
            project.channel_name = metadata.channel_name
            project.duration_seconds = metadata.duration_seconds
            project.thumbnail_url = metadata.thumbnail_url
            project.published_at = metadata.published_at
            project.project_metadata = metadata.raw_payload
            project.status = "ready"
            project.error_message = None
            await session.commit()

            event_data = {
                "type": "status_changed",
                "project_id": project_id_str,
                "status": "ready",
                "title": project.title,
                "channel_name": project.channel_name,
                "duration_seconds": project.duration_seconds,
                "thumbnail_url": project.thumbnail_url,
                "published_at": project.published_at.isoformat() if project.published_at else None,
            }
            publish_project_event(project_id_str, event_data)

            return {
                "status": "success",
                "project_id": project_id_str,
                "title": project.title,
            }

        except (RateLimitError, ProviderUnavailableError) as temporary_error:
            retries = task_instance.request.retries
            if retries < 3:
                countdown = 5 * (2 ** retries)
                logger.warning(
                    f"Temporary error for project {project_id}: {temporary_error}. Retrying in {countdown}s..."
                )
                raise task_instance.retry(exc=temporary_error, countdown=countdown)
            else:
                user_msg = temporary_error.user_message
                project.status = "failed"
                project.error_message = user_msg
                await session.commit()
                publish_project_event(
                    project_id_str,
                    {
                        "type": "status_changed",
                        "project_id": project_id_str,
                        "status": "failed",
                        "error_message": user_msg,
                    },
                )
                return {"status": "failed", "error": user_msg}

        except Exception as non_retryable_error:
            user_msg = getattr(
                non_retryable_error,
                "user_message",
                str(non_retryable_error) or "An unexpected error occurred while fetching video metadata.",
            )
            logger.error(f"Failed to fetch metadata for project {project_id}: {user_msg}")
            project.status = "failed"
            project.error_message = user_msg
            await session.commit()
            publish_project_event(
                project_id_str,
                {
                    "type": "status_changed",
                    "project_id": project_id_str,
                    "status": "failed",
                    "error_message": user_msg,
                },
            )
            return {"status": "failed", "error": user_msg}


@celery_app.task(name="metadata.fetch", bind=True, max_retries=3)
def fetch_metadata(self, project_id: str) -> Dict[str, Any]:
    """
    Celery task to fetch external stream/video metadata.
    Handles async execution internally.
    """
    logger.info(f"Starting fetch_metadata task for project {project_id}")
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = pool.submit(asyncio.run, _async_fetch_metadata(self, str(project_id))).result()
        else:
            result = loop.run_until_complete(_async_fetch_metadata(self, str(project_id)))
    except RuntimeError:
        result = asyncio.run(_async_fetch_metadata(self, str(project_id)))

    return result
