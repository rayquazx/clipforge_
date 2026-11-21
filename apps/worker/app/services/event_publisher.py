"""
ClipForge — Event Publisher.

Publishes structured Server-Sent Events to the user's Redis pub/sub channel.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict
import uuid

import redis.asyncio as aioredis
import redis

from app.config import get_settings

logger = logging.getLogger(__name__)


async def publish_user_event_async(user_id: uuid.UUID, event: str, data: Dict[str, Any]) -> None:
    """Publish an SSE event to Redis channel events:user:{user_id} asynchronously."""
    settings = get_settings()
    try:
        r = aioredis.from_url(settings.REDIS_URL)
        channel = f"events:user:{user_id}"
        payload = json.dumps({"event": event, "data": data})
        await r.publish(channel, payload)
        await r.aclose()
    except Exception as exc:
        logger.warning("Failed to publish event %s to user %s: %s", event, user_id, exc)


def publish_user_event_sync(user_id: uuid.UUID, event: str, data: Dict[str, Any]) -> None:
    """Publish an SSE event to Redis channel events:user:{user_id} synchronously (for Celery workers)."""
    settings = get_settings()
    try:
        r = redis.from_url(settings.REDIS_URL)
        channel = f"events:user:{user_id}"
        payload = json.dumps({"event": event, "data": data})
        r.publish(channel, payload)
        r.close()
    except Exception as exc:
        logger.warning("Failed to publish event %s to user %s: %s", event, user_id, exc)
