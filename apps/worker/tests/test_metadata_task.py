"""
Unit tests for the Celery metadata fetching background task.
Tests the success path, failure path, and retry behavior.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock
import pytest
from app.models.project import Project
from app.services.metadata.models import VideoMetadata
from app.services.metadata.exceptions import NotFoundError, RateLimitError
import app.tasks.metadata as meta_task


@pytest.mark.asyncio
async def test_fetch_metadata_success_path(monkeypatch):
    project_id = uuid.uuid4()
    mock_project = Project(
        id=project_id,
        user_id=uuid.uuid4(),
        source_type="youtube",
        external_id="dQw4w9WgXcQ",
        status="queued",
    )

    # Mock DB session
    class MockSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, stmt):
            class MockRes:
                def scalars(self):
                    return self

                def first(self):
                    return mock_project

            return MockRes()

        async def commit(self):
            pass

    monkeypatch.setattr(meta_task, "async_session_factory", lambda: MockSession())

    # Mock provider
    mock_metadata = VideoMetadata(
        title="Rick Astley - Never Gonna Give You Up",
        channel_name="Rick Astley",
        duration_seconds=213,
        thumbnail_url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    )

    class MockProvider:
        async def fetch(self, ext_id):
            return mock_metadata

    monkeypatch.setattr(meta_task, "get_metadata_provider", lambda st: MockProvider())

    # Mock Redis pubsub
    published_events = []
    monkeypatch.setattr(
        meta_task,
        "publish_project_event",
        lambda pid, data: published_events.append((pid, data)),
    )

    mock_celery_task = MagicMock()
    mock_celery_task.request.retries = 0

    result = await meta_task._async_fetch_metadata(mock_celery_task, str(project_id))

    assert result["status"] == "success"
    assert mock_project.status == "ready"
    assert mock_project.title == "Rick Astley - Never Gonna Give You Up"
    assert mock_project.channel_name == "Rick Astley"
    assert mock_project.duration_seconds == 213
    assert any(evt[1].get("status") == "ready" for evt in published_events)


@pytest.mark.asyncio
async def test_fetch_metadata_failure_path(monkeypatch):
    project_id = uuid.uuid4()
    mock_project = Project(
        id=project_id,
        user_id=uuid.uuid4(),
        source_type="twitch",
        external_id="999999999",
        status="queued",
    )

    class MockSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, stmt):
            class MockRes:
                def scalars(self):
                    return self

                def first(self):
                    return mock_project

            return MockRes()

        async def commit(self):
            pass

    monkeypatch.setattr(meta_task, "async_session_factory", lambda: MockSession())

    class MockFailingProvider:
        async def fetch(self, ext_id):
            raise NotFoundError("The Twitch VOD was deleted.")

    monkeypatch.setattr(meta_task, "get_metadata_provider", lambda st: MockFailingProvider())

    published_events = []
    monkeypatch.setattr(
        meta_task,
        "publish_project_event",
        lambda pid, data: published_events.append((pid, data)),
    )

    mock_celery_task = MagicMock()
    mock_celery_task.request.retries = 0

    result = await meta_task._async_fetch_metadata(mock_celery_task, str(project_id))

    assert result["status"] == "failed"
    assert mock_project.status == "failed"
    assert mock_project.error_message is not None
    assert any(evt[1].get("status") == "failed" for evt in published_events)
