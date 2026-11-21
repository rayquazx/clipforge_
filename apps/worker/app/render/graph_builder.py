"""
ClipForge Render Module — FFmpeg Graph Builder.

Constructs safe, argument-list FFmpeg commands from Clip edit_state and RenderOptions.
Follows an ordered 7-step pipeline with clearly marked reserved extension points.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple, Union


def sanitize_filename(title: Optional[str], default: str = "clip") -> str:
    """
    Sanitize a user-provided clip title into a safe filename.

    - Replaces characters not in [a-zA-Z0-9_] with underscores.
    - Strips leading/trailing spaces and underscores.
    - Limits length to 100 characters.
    - Ensures .mp4 extension.
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


class GraphBuilder:
    """
    Builds structured, shell-injection-safe FFmpeg CLI arguments.

    Ordered Pipeline Steps:
      1. Trim (Frame-accurate cut via input seek pre-roll + sub-seek output trim)
      2. Reserved: Reframe / Aspect Ratio (9:16 vertical crop, auto-tracking)
      3. Reserved: Overlays (logos, lower thirds, emojis, reaction stickers)
      4. Reserved: Subtitles (burned-in styled/animated karaoke captions)
      5. Reserved: Ads & Sponsor Bumpers (pre-roll / mid-roll ad compositing)
      6. Audio (resampling, normalization, volume adjustments, AAC)
      7. Encode (H.264, yuv420p, faststart, resolution, fps, CRF/preset by quality)
    """

    PRE_ROLL_SECONDS: float = 2.0

    @classmethod
    def calculate_trim_points(
        cls, start_sec: float, end_sec: float
    ) -> Tuple[float, float, float]:
        """
        Calculate (input_seek, sub_seek, duration) for frame-accurate cuts.

        ========================================================================
        Frame-accurate Cut Approach:
        ------------------------------------------------------------------------
        In video compression (e.g. H.264 GOP structure), keyframes (I-frames)
        occur only once every few seconds.
        - Fast seeking with `-ss` before `-i` seeks directly to the nearest keyframe
          before the timestamp, but lacks sub-keyframe frame accuracy.
        - Output seeking with `-ss` after `-i` decodes from the beginning, which is
          frame-accurate but prohibitively slow for long 2-hour streams.

        Our two-stage approach solves both:
        1. Input Seek Pre-roll: We pass `-ss <input_seek>` BEFORE `-i`, where
           `input_seek = max(0.0, start_sec - PRE_ROLL_SECONDS)`. This performs a
           lightning-fast keyframe jump just ahead of our cut point.
        2. Output Sub-seek: We pass `-ss <sub_seek>` and `-t <duration>` AFTER `-i`,
           where `sub_seek = start_sec - input_seek`. FFmpeg only has to decode
           the tiny pre-roll gap (~2 seconds) to arrive at the exact target frame,
           guaranteeing frame accuracy with zero black frames or A/V desync.
        ========================================================================
        """
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
        """
        Produce a list of FFmpeg CLI arguments.

        Parameters
        ----------
        source_path:
            Local path to input media.
        output_path:
            Destination path for the rendered MP4.
        edit_state:
            Dictionary matching EditState ({'schema_version': 1, 'trim': {'start': float, 'end': float}}).
        options:
            RenderOptions dict or object (resolution, fps, quality).

        Returns
        -------
        List[str]
            Safe argument list ready for subprocess.Popen.
        """
        opt_dict = options if isinstance(options, dict) else (options.model_dump() if hasattr(options, "model_dump") else {})
        resolution = opt_dict.get("resolution", "original")
        fps = opt_dict.get("fps", "original")
        quality = opt_dict.get("quality", "high")

        trim = edit_state.get("trim", {}) if isinstance(edit_state, dict) else {}
        start_sec = float(trim.get("start", 0.0))
        end_sec = float(trim.get("end", 0.0))

        # ---------------------------------------------------------------------
        # Step 1: Trim (Input seek with pre-roll)
        # ---------------------------------------------------------------------
        input_seek, sub_seek, duration = cls.calculate_trim_points(start_sec, end_sec)

        cmd: List[str] = [
            "ffmpeg",
            "-y",  # Overwrite output
            "-ss", f"{input_seek:.3f}",
            "-i", source_path,
            "-ss", f"{sub_seek:.3f}",
            "-t", f"{duration:.3f}",
        ]

        # ---------------------------------------------------------------------
        # Step 2: Reserved Extension Point — Reframe / Aspect Ratio
        # (e.g. 9:16 vertical crop, auto-framing, pan & scan)
        # ---------------------------------------------------------------------
        video_filters: List[str] = []
        # EXTENSION_POINT_STEP_2_REFRAME

        # ---------------------------------------------------------------------
        # Step 3: Reserved Extension Point — Overlays
        # (e.g. watermark, stream badges, lower thirds)
        # ---------------------------------------------------------------------
        # EXTENSION_POINT_STEP_3_OVERLAYS

        # ---------------------------------------------------------------------
        # Step 4: Reserved Extension Point — Subtitles
        # (e.g. burning karaoke animated captions)
        # ---------------------------------------------------------------------
        # EXTENSION_POINT_STEP_4_SUBTITLES

        # ---------------------------------------------------------------------
        # Step 5: Reserved Extension Point — Ad Insertion
        # (e.g. pre-roll sponsor bumpers, end-cards)
        # ---------------------------------------------------------------------
        # EXTENSION_POINT_STEP_5_ADS

        # ---------------------------------------------------------------------
        # Step 6: Audio Processing
        # (resampling, volume normalization, stereo mix)
        # ---------------------------------------------------------------------
        cmd.extend([
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "48000",
            "-ac", "2",
        ])

        # ---------------------------------------------------------------------
        # Step 7: Video Encoding & Filter Chain
        # ---------------------------------------------------------------------
        # Resolution filter
        if resolution == "1080p":
            video_filters.append("scale=-2:1080")
        elif resolution == "720p":
            video_filters.append("scale=-2:720")

        if video_filters:
            cmd.extend(["-vf", ",".join(video_filters)])

        # Frame rate
        if fps == 30 or fps == "30":
            cmd.extend(["-r", "30"])
        elif fps == 60 or fps == "60":
            cmd.extend(["-r", "60"])

        # Quality settings (CRF + preset)
        if quality == "small":
            cmd.extend(["-crf", "28", "-preset", "faster"])
        elif quality == "medium":
            cmd.extend(["-crf", "23", "-preset", "medium"])
        else:  # "high"
            cmd.extend(["-crf", "18", "-preset", "slow"])

        # Container & compatibility flags
        cmd.extend([
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-progress", "pipe:1",
            "-nostats",
            output_path,
        ])

        return cmd
