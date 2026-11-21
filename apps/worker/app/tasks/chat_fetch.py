"""
ClipForge Worker — chat fetch task (Phase 2 implementation).

Fetches live-chat / VOD-chat replay data for a stream and persists it
for downstream analysis.  Currently returns a placeholder result.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="chat.fetch", bind=True)
def fetch_chat(self: Any, stream_url: str, **kwargs: Any) -> Dict[str, str]:
    """Fetch chat messages for the stream at *stream_url*.

    Parameters
    ----------
    self:
        Bound Celery task instance.
    stream_url:
        URL of the stream whose chat replay should be fetched.

    Returns
    -------
    dict
        ``{"status": "not_implemented"}`` until Phase 2.
    """
    logger.info(
        "Chat fetch task placeholder — task_id=%s, stream_url=%s",
        self.request.id,
        stream_url,
    )
    return {"status": "not_implemented"}
