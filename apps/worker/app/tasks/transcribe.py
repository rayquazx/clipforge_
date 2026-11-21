"""
ClipForge Worker — transcribe task (Phase 2 implementation).

Transcribes audio extracted from a downloaded video using faster-whisper.
Currently returns a placeholder result.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="transcribe.audio", bind=True)
def transcribe_audio(self: Any, audio_path: str, **kwargs: Any) -> Dict[str, str]:
    """Transcribe audio at *audio_path* using Whisper.

    Parameters
    ----------
    self:
        Bound Celery task instance.
    audio_path:
        Local or MinIO path to the audio file.

    Returns
    -------
    dict
        ``{"status": "not_implemented"}`` until Phase 2.
    """
    logger.info(
        "Transcribe task placeholder — task_id=%s, audio_path=%s",
        self.request.id,
        audio_path,
    )
    return {"status": "not_implemented"}
