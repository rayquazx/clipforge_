"""
ClipForge Render Module (API side mirror).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple, Union

from app.utils.filename import sanitize_filename


class GraphBuilder:
    """
    Builds structured, shell-injection-safe FFmpeg CLI arguments.
    """

    PRE_ROLL_SECONDS: float = 2.0

    @classmethod
    def calculate_trim_points(
        cls, start_sec: float, end_sec: float
    ) -> Tuple[float, float, float]:
        start = max(0.0, float(start_sec))
        end = max(start + 0.1, float(end_sec))
        duration = end - start

        input_seek = max(0.0, start - cls.PRE_ROLL_SECONDS)
        sub_seek = start - input_seek

        return input_seek, sub_seek, duration

    @classmethod
    def build_ffmpeg_args(
        cls,
        source_path: str,
        output_path: str,
        edit_state: Dict[str, Any],
        options: Optional[Union[Dict[str, Any], Any]] = None,
    ) -> List[str]:
        opt_dict = options if isinstance(options, dict) else (options.model_dump() if hasattr(options, "model_dump") else {})
        resolution = opt_dict.get("resolution", "original")
        fps = opt_dict.get("fps", "original")
        quality = opt_dict.get("quality", "high")

        trim = edit_state.get("trim", {}) if isinstance(edit_state, dict) else {}
        start_sec = float(trim.get("start", 0.0))
        end_sec = float(trim.get("end", 0.0))

        input_seek, sub_seek, duration = cls.calculate_trim_points(start_sec, end_sec)

        cmd: List[str] = [
            "ffmpeg",
            "-y",
            "-ss", f"{input_seek:.3f}",
            "-i", source_path,
            "-ss", f"{sub_seek:.3f}",
            "-t", f"{duration:.3f}",
        ]

        video_filters: List[str] = []
        # Step 2: Reserved Extension Point - Reframe
        # Step 3: Reserved Extension Point - Overlays
        # Step 4: Reserved Extension Point - Subtitles
        # Step 5: Reserved Extension Point - Ads

        # Step 6: Audio
        cmd.extend([
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "48000",
            "-ac", "2",
        ])

        # Step 7: Video Encode
        if resolution == "1080p":
            video_filters.append("scale=-2:1080")
        elif resolution == "720p":
            video_filters.append("scale=-2:720")

        if video_filters:
            cmd.extend(["-vf", ",".join(video_filters)])

        if fps == 30 or fps == "30":
            cmd.extend(["-r", "30"])
        elif fps == 60 or fps == "60":
            cmd.extend(["-r", "60"])

        if quality == "small":
            cmd.extend(["-crf", "28", "-preset", "faster"])
        elif quality == "medium":
            cmd.extend(["-crf", "23", "-preset", "medium"])
        else:
            cmd.extend(["-crf", "18", "-preset", "slow"])

        cmd.extend([
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-progress", "pipe:1",
            "-nostats",
            output_path,
        ])

        return cmd
