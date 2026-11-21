"""
ClipForge Worker — download task (Phase 2 implementation).

Downloads a stream VOD or live segment via yt-dlp and uploads the result
to MinIO.  Currently returns a placeholder result.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="download.video", bind=True)
def download_video(self: Any, stream_url: str, **kwargs: Any) -> Dict[str, str]:
    """Download a video from *stream_url*.

    Parameters
    ----------
    self:
        Bound Celery task instance (provides ``self.request.id``, etc.).
    stream_url:
        URL of the stream / VOD to download.

    Returns
    -------
    dict
        ``{"status": "not_implemented"}`` until Phase 2.
    """
    logger.info(
        "Download task placeholder — task_id=%s, stream_url=%s",
        self.request.id,
        stream_url,
    )
    return {"status": "not_implemented"}
