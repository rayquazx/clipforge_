"""
ClipForge API — Server-Sent Events (SSE) Router (Phase 4).

Streams real-time preview and rendering progress events to authenticated clients
via Redis Pub/Sub, formatted per the Phase 4 API contract.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator, Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["events"])
settings = get_settings()


async def _sse_event_generator(
    user_id: uuid.UUID,
    clip_id_filter: Optional[uuid.UUID],
    request: Request,
) -> AsyncGenerator[str, None]:
    """
    Subscribes to the user's private Redis pub/sub channel and yields SSE events.
    Sends a heartbeat comment every 15 seconds.
    """
    r = aioredis.from_url(settings.REDIS_URL)
    pubsub = r.pubsub()
    channel_name = f"events:user:{user_id}"
    await pubsub.subscribe(channel_name)

    heartbeat_interval = 15.0
    last_heartbeat = asyncio.get_event_loop().time()

    # Initial comment to verify stream connection
    yield ": connected\n\n"

    try:
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            now = asyncio.get_event_loop().time()
            if now - last_heartbeat >= heartbeat_interval:
                yield ": heartbeat\n\n"
                last_heartbeat = now

            try:
                # Non-blocking get message with short timeout
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Error reading Redis pubsub message: %s", e)
                await asyncio.sleep(1.0)
                continue

            if message and message.get("type") == "message":
                try:
                    payload = json.loads(message["data"])
                    event_type = payload.get("event")
                    event_data = payload.get("data", {})

                    # If clip_id filter is specified, check match
                    if clip_id_filter is not None:
                        msg_clip_id = event_data.get("clip_id")
                        if msg_clip_id and str(msg_clip_id) != str(clip_id_filter):
                            continue

                    data_json = json.dumps(event_data)
                    yield f"event: {event_type}\ndata: {data_json}\n\n"
                except Exception as exc:
                    logger.warning("Failed to serialize SSE event: %s", exc)

            await asyncio.sleep(0.1)

    finally:
        try:
            await pubsub.unsubscribe(channel_name)
            await pubsub.aclose()
            await r.aclose()
        except Exception:
            pass


@router.get("/events/stream")
async def sse_event_stream(
    request: Request,
    clip_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Server-Sent Events endpoint streaming preview and render events for current user.
    Optional query parameter ?clip_id= filters events for that clip.
    """
    return StreamingResponse(
        _sse_event_generator(current_user.id, clip_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
