"""
ClipForge API — Configuration Router (Phase 4).
"""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends

from app.config import get_settings
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.clip import ConfigResponse

router = APIRouter(tags=["config"])
settings = get_settings()


@router.get("/config", response_model=ConfigResponse)
async def get_configuration(current_user: User = Depends(get_current_user)) -> Any:
    """
    Return global editor and export configurations:
    - max_clip_seconds: Maximum allowed clip duration.
    - preview_padding_sec: Padding added before/after clip in preview proxy.
    - export_resolutions: Supported export resolutions list.
    """
    return {
        "max_clip_seconds": settings.MAX_CLIP_SECONDS,
        "preview_padding_sec": settings.PREVIEW_PADDING_SEC,
        "export_resolutions": settings.EXPORT_RESOLUTIONS,
    }
