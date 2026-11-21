"""
ClipForge Filename Sanitization Helper.
"""

from __future__ import annotations

import re
from typing import Optional


def sanitize_filename(title: Optional[str], default: str = "clip") -> str:
    """
    Sanitize a user-provided clip title into a safe filename for export downloads.
    """
    if not title or not title.strip():
        return f"{default}.mp4"

    clean = title.strip()
    if clean.lower().endswith(".mp4"):
        clean = clean[:-4]

    name = re.sub(r"[^\w]+", "_", clean)
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = default

    if len(name) > 100:
        name = name[:100].rstrip("_")

    return f"{name}.mp4"
