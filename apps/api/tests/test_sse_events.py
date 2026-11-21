"""
Tests for Phase 4 SSE event stream generator and filtering.
"""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.routers.events import _sse_event_generator


@pytest.mark.asyncio
async def test_sse_event_generator_heartbeat_and_message():
    user_id = uuid.uuid4()
    clip_id = uuid.uuid4()

    mock_request = MagicMock()
    # First 3 checks returns False (connected), then True (disconnected)
    disconnect_calls = [False, False, False, True]
    mock_request.is_disconnected = AsyncMock(side_effect=lambda: disconnect_calls.pop(0) if disconnect_calls else True)

    mock_pubsub = MagicMock()
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.aclose = AsyncMock()

    sample_event = {
        "event": "preview.progress",
        "data": {
            "clip_id": str(clip_id),
            "stage": "transcoding",
            "progress": 50,
        },
    }

    messages = [
        {"type": "message", "data": json.dumps(sample_event)},
        None,
    ]
    mock_pubsub.get_message = AsyncMock(side_effect=lambda **kwargs: messages.pop(0) if messages else None)

    mock_redis = MagicMock()
    mock_redis.pubsub = MagicMock(return_value=mock_pubsub)
    mock_redis.aclose = AsyncMock()

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        gen = _sse_event_generator(user_id=user_id, clip_id_filter=clip_id, request=mock_request)
        chunks = []
        async for chunk in gen:
            chunks.append(chunk)

    # First chunk is connected comment
    assert chunks[0] == ": connected\n\n"
    # Second chunk should be the preview.progress event
    assert "event: preview.progress\n" in chunks[1]
    assert f'"clip_id": "{clip_id}"' in chunks[1]
    assert '"progress": 50' in chunks[1]


@pytest.mark.asyncio
async def test_sse_event_filtering_by_clip_id():
    user_id = uuid.uuid4()
    target_clip = uuid.uuid4()
    other_clip = uuid.uuid4()

    mock_request = MagicMock()
    disconnect_calls = [False, False, True]
    mock_request.is_disconnected = AsyncMock(side_effect=lambda: disconnect_calls.pop(0) if disconnect_calls else True)

    mock_pubsub = MagicMock()
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.aclose = AsyncMock()

    messages = [
        {
            "type": "message",
            "data": json.dumps({
                "event": "preview.ready",
                "data": {"clip_id": str(other_clip)},
            }),
        },
        None,
    ]
    mock_pubsub.get_message = AsyncMock(side_effect=lambda **kwargs: messages.pop(0) if messages else None)

    mock_redis = MagicMock()
    mock_redis.pubsub = MagicMock(return_value=mock_pubsub)
    mock_redis.aclose = AsyncMock()

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        # We filter by target_clip, so other_clip event must be skipped
        gen = _sse_event_generator(user_id=user_id, clip_id_filter=target_clip, request=mock_request)
        chunks = []
        async for chunk in gen:
            chunks.append(chunk)

    # Only connection handshake yielded, no event for other_clip
    assert chunks == [": connected\n\n"]
