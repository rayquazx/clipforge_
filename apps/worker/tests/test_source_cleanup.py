"""
Tests for source media caching and cleanup rules.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import pytest

from app.models.source_media import SourceMedia
from app.services.media_fetcher import cleanup_unused_source_media


@pytest.mark.asyncio
async def test_cleanup_unused_source_media_leaves_active_and_recent():
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    
    # Media 1: Stale and inactive -> should be removed
    stale_media = MagicMock(spec=SourceMedia)
    stale_media.id = uuid.uuid4()
    stale_media.project_id = uuid.uuid4()
    stale_media.storage_key = "source_media/project_1/video.mp4"
    stale_media.last_used_at = cutoff - timedelta(days=2)

    mock_session = AsyncMock()
    # Mock active projects query returning project_2 (an active job)
    active_project_id = uuid.uuid4()
    active_scalars = MagicMock()
    active_scalars.all.return_value = [active_project_id]

    stale_scalars = MagicMock()
    stale_scalars.all.return_value = [stale_media]

    mock_execute_results = [
        MagicMock(scalars=MagicMock(return_value=active_scalars)),
        MagicMock(scalars=MagicMock(return_value=stale_scalars)),
    ]
    mock_session.execute = AsyncMock(side_effect=mock_execute_results)
    mock_session.delete = AsyncMock()
    mock_session.commit = AsyncMock()

    mock_context = AsyncMock()
    mock_context.__aenter__.return_value = mock_session
    mock_context.__aexit__.return_value = None
    mock_session_factory = MagicMock(return_value=mock_context)

    mock_minio = MagicMock()
    mock_minio.remove_object = MagicMock()

    with patch("app.services.media_fetcher.AsyncSessionLocal", mock_session_factory), \
         patch("app.services.media_fetcher.get_minio_client", return_value=mock_minio):
        
        deleted_count = await cleanup_unused_source_media(retention_days=7)

    assert deleted_count == 1
    mock_minio.remove_object.assert_called_once_with("clipforge", stale_media.storage_key)
    mock_session.delete.assert_called_once_with(stale_media)
    mock_session.commit.assert_called_once()
