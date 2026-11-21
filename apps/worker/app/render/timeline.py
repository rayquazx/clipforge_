"""
ClipForge — Timeline Calculator (Phase 6).

Single source of truth for timeline duration calculation and time shifts.
Used by both API (/clips/{id}/timeline-info) and the FFmpeg Render Graph Builder.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple


def calculate_clip_timeline(edit_state: Dict[str, Any]) -> Dict[str, float]:
    """
    Compute main, preroll, postroll, and total durations for a clip edit_state.

    Returns:
        {
            "main_duration_sec": float,
            "preroll_duration_sec": float,
            "postroll_duration_sec": float,
            "total_duration_sec": float,
        }
    """
    trim = edit_state.get("trim", {}) if isinstance(edit_state, dict) else {}
    start_sec = float(trim.get("start", 0.0))
    end_sec = float(trim.get("end", 0.0))
    main_duration = max(0.1, end_sec - start_sec)

    ads = edit_state.get("ads", []) if isinstance(edit_state, dict) else []
    preroll_total = 0.0
    postroll_total = 0.0

    if isinstance(ads, list):
        for placement in ads:
            if not isinstance(placement, dict):
                continue
            ptype = placement.get("type")
            timing = placement.get("timing", {}) or {}
            dur = float(timing.get("duration_sec") or 0.0)

            if ptype == "preroll":
                preroll_total += dur
            elif ptype == "postroll":
                postroll_total += dur

    total_duration = preroll_total + main_duration + postroll_total

    return {
        "main_duration_sec": round(main_duration, 3),
        "preroll_duration_sec": round(preroll_total, 3),
        "postroll_duration_sec": round(postroll_total, 3),
        "total_duration_sec": round(total_duration, 3),
    }
