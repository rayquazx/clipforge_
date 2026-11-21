"""
ClipForge Render Module — FFmpeg Graph Builder (Phase 6).

Constructs safe, argument-list FFmpeg commands from Clip edit_state, RenderOptions,
and resolved media assets.
Implements the 7-stage composable render pipeline with full Phase 6 Ad compositing:
  1. Trim
  2. Reframe / Aspect Ratio
  3. Overlays
  4. Subtitles
  5. Ads & Sponsor Bumpers (Pre-roll, Post-roll, Overlays, Lower Thirds)
  6. Audio Processing & Mixing
  7. Video Encoding
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Tuple, Union

from app.render.timeline import calculate_clip_timeline

MAX_PREROLL_TOTAL_SEC = 30.0


def sanitize_filename(title: Optional[str], default: str = "clip") -> str:
    """Sanitize a user-provided clip title into a safe filename."""
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
    Pure function: (source_path, output_path, edit_state, options, resolved_ad_assets) -> List[str].
    """

    PRE_ROLL_SECONDS: float = 2.0

    @classmethod
    def calculate_trim_points(
        cls, start_sec: float, end_sec: float
    ) -> Tuple[float, float, float]:
        """Calculate (input_seek, sub_seek, duration) for frame-accurate cuts."""
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
        resolved_ad_assets: Optional[Dict[str, str]] = None,
    ) -> List[str]:
        """
        Produce a list of FFmpeg CLI arguments for rendering.

        Parameters
        ----------
        source_path:
            Local path to input media.
        output_path:
            Destination path for rendered MP4.
        edit_state:
            Dictionary matching EditState schema.
        options:
            RenderOptions dict or object.
        resolved_ad_assets:
            Optional mapping of ad_asset_id (str) -> local file path.
        """
        opt_dict = options if isinstance(options, dict) else (options.model_dump() if hasattr(options, "model_dump") else {})
        resolution = opt_dict.get("resolution", "original")
        fps = opt_dict.get("fps", "original")
        quality = opt_dict.get("quality", "high")
        is_preview = bool(opt_dict.get("is_preview", False)) or resolution == "360p"

        resolved_ads = resolved_ad_assets or {}

        # ---------------------------------------------------------------------
        # 1. Timeline & Durations Calculation
        # ---------------------------------------------------------------------
        timeline_info = calculate_clip_timeline(edit_state)
        main_duration = timeline_info["main_duration_sec"]
        preroll_total = timeline_info["preroll_duration_sec"]
        postroll_total = timeline_info["postroll_duration_sec"]

        if preroll_total > MAX_PREROLL_TOTAL_SEC:
            raise ValueError(
                f"Total preroll ad duration ({preroll_total:.1f}s) exceeds maximum allowed 30 seconds."
            )

        trim = edit_state.get("trim", {}) if isinstance(edit_state, dict) else {}
        start_sec = float(trim.get("start", 0.0))
        end_sec = float(trim.get("end", 0.0))
        input_seek, sub_seek, duration = cls.calculate_trim_points(start_sec, end_sec)

        # Parse ad placements
        ads = edit_state.get("ads", []) if isinstance(edit_state, dict) else []
        preroll_placements = [p for p in ads if p.get("type") == "preroll"]
        postroll_placements = [p for p in ads if p.get("type") == "postroll"]
        overlay_placements = [p for p in ads if p.get("type") in ("overlay", "lower_third")]

        # Determine target canvas resolution for normalization
        if resolution == "360p":
            target_w, target_h = 640, 360
        elif resolution == "720p":
            target_w, target_h = 1280, 720
        elif resolution == "1080p":
            target_w, target_h = 1920, 1080
        else:
            target_w, target_h = 1920, 1080  # Default canvas

        # Check for vertical aspect ratio preset from Phase 5 format
        format_cfg = edit_state.get("format", {}) or {}
        aspect_preset = format_cfg.get("preset", "16:9")
        if aspect_preset == "9:16":
            target_w, target_h = target_h, target_w  # e.g. 1080x1920 or 360x640
        elif aspect_preset == "1:1":
            target_w, target_h = min(target_w, target_h), min(target_w, target_h)
        elif aspect_preset == "4:5":
            target_w, target_h = 1080, 1350

        # If no ads are attached, use the fast/direct single-input filter chain (100% Phase 4 backwards-compatible)
        if not preroll_placements and not postroll_placements and not overlay_placements:
            cmd = [
                "ffmpeg",
                "-y",
                "-ss", f"{input_seek:.3f}",
                "-i", source_path,
                "-ss", f"{sub_seek:.3f}",
                "-t", f"{duration:.3f}",
                "-c:a", "aac",
                "-b:a", "128k",
                "-ar", "48000",
                "-ac", "2",
            ]

            video_filters: List[str] = []
            if resolution == "1080p":
                video_filters.append("scale=-2:1080")
            elif resolution == "720p":
                video_filters.append("scale=-2:720")
            elif resolution == "360p":
                video_filters.append("scale=-2:360")

            if video_filters:
                cmd.extend(["-vf", ",".join(video_filters)])

            if fps == 30 or fps == "30":
                cmd.extend(["-r", "30"])
            elif fps == 60 or fps == "60":
                cmd.extend(["-r", "60"])

            if is_preview or quality == "small":
                cmd.extend(["-crf", "28", "-preset", "ultrafast" if is_preview else "faster"])
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

        # ---------------------------------------------------------------------
        # 2. Multi-Input Ads Compositing (Phase 6 Step 5)
        # ---------------------------------------------------------------------
        cmd: List[str] = ["ffmpeg", "-y"]

        # Input 0: Main source video
        cmd.extend([
            "-ss", f"{input_seek:.3f}",
            "-i", source_path,
        ])

        # Track input index mapping
        # index 0: main source
        current_input_idx = 1
        preroll_inputs: List[Tuple[int, Dict[str, Any], str]] = []
        postroll_inputs: List[Tuple[int, Dict[str, Any], str]] = []
        overlay_inputs: List[Tuple[int, Dict[str, Any], str]] = []

        # Preroll ad inputs
        for p in preroll_placements:
            aid = str(p.get("ad_asset_id"))
            if aid not in resolved_ads:
                raise FileNotFoundError(f"Missing ad asset media file for ad_asset_id={aid}")
            ad_path = resolved_ads[aid]
            dur = float(p.get("timing", {}).get("duration_sec") or 5.0)

            ext = os.path.splitext(ad_path)[1].lower()
            if ext in (".png", ".jpg", ".jpeg", ".webp"):
                # Image/text loop input
                cmd.extend(["-loop", "1", "-t", f"{dur:.3f}", "-i", ad_path])
            else:
                cmd.extend(["-t", f"{dur:.3f}", "-i", ad_path])

            preroll_inputs.append((current_input_idx, p, ad_path))
            current_input_idx += 1

        # Postroll ad inputs
        for p in postroll_placements:
            aid = str(p.get("ad_asset_id"))
            if aid not in resolved_ads:
                raise FileNotFoundError(f"Missing ad asset media file for ad_asset_id={aid}")
            ad_path = resolved_ads[aid]
            dur = float(p.get("timing", {}).get("duration_sec") or 5.0)

            ext = os.path.splitext(ad_path)[1].lower()
            if ext in (".png", ".jpg", ".jpeg", ".webp"):
                cmd.extend(["-loop", "1", "-t", f"{dur:.3f}", "-i", ad_path])
            else:
                cmd.extend(["-t", f"{dur:.3f}", "-i", ad_path])

            postroll_inputs.append((current_input_idx, p, ad_path))
            current_input_idx += 1

        # Overlay ad inputs
        for p in overlay_placements:
            aid = str(p.get("ad_asset_id"))
            if aid not in resolved_ads:
                raise FileNotFoundError(f"Missing ad asset media file for ad_asset_id={aid}")
            ad_path = resolved_ads[aid]

            ext = os.path.splitext(ad_path)[1].lower()
            if ext in (".png", ".jpg", ".jpeg", ".webp"):
                cmd.extend(["-loop", "1", "-i", ad_path])
            else:
                cmd.extend(["-stream_loop", "-1", "-i", ad_path])

            overlay_inputs.append((current_input_idx, p, ad_path))
            current_input_idx += 1

        # ---------------------------------------------------------------------
        # 3. Filter Complex Construction
        # ---------------------------------------------------------------------
        filter_complex: List[str] = []

        # Main video trim sub-seek
        filter_complex.append(
            f"[0:v]trim=start={sub_seek:.3f}:duration={duration:.3f},setpts=PTS-STARTPTS,"
            f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2,"
            f"setsar=1,fps=30,format=yuv420p[main_v]"
        )
        filter_complex.append(
            f"[0:a]atrim=start={sub_seek:.3f}:duration={duration:.3f},asetpts=PTS-STARTPTS,"
            f"aformat=sample_rates=48000:channel_layouts=stereo[main_a]"
        )

        concat_v_labels: List[str] = []
        concat_a_labels: List[str] = []

        # Process prerolls
        for idx, (in_idx, p, path) in enumerate(preroll_inputs):
            v_lbl = f"pre_v_{idx}"
            a_lbl = f"pre_a_{idx}"
            dur = float(p.get("timing", {}).get("duration_sec") or 5.0)
            vol = float(p.get("audio", {}).get("volume", 1.0))

            filter_complex.append(
                f"[{in_idx}:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,"
                f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[{v_lbl}]"
            )

            ext = os.path.splitext(path)[1].lower()
            if ext in (".png", ".jpg", ".jpeg", ".webp"):
                # Image/text ad has no audio, generate silent audio segment
                filter_complex.append(
                    f"anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration={dur:.3f}[{a_lbl}]"
                )
            else:
                filter_complex.append(
                    f"[{in_idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,volume={vol:.2f}[{a_lbl}]"
                )

            concat_v_labels.append(f"[{v_lbl}]")
            concat_a_labels.append(f"[{a_lbl}]")

        # Main clip in concat sequence
        concat_v_labels.append("[main_v]")
        concat_a_labels.append("[main_a]")

        # Process postrolls
        for idx, (in_idx, p, path) in enumerate(postroll_inputs):
            v_lbl = f"post_v_{idx}"
            a_lbl = f"post_a_{idx}"
            dur = float(p.get("timing", {}).get("duration_sec") or 5.0)
            vol = float(p.get("audio", {}).get("volume", 1.0))

            filter_complex.append(
                f"[{in_idx}:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,"
                f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[{v_lbl}]"
            )

            ext = os.path.splitext(path)[1].lower()
            if ext in (".png", ".jpg", ".jpeg", ".webp"):
                filter_complex.append(
                    f"anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration={dur:.3f}[{a_lbl}]"
                )
            else:
                filter_complex.append(
                    f"[{in_idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,volume={vol:.2f}[{a_lbl}]"
                )

            concat_v_labels.append(f"[{v_lbl}]")
            concat_a_labels.append(f"[{a_lbl}]")

        # Concatenate prerolls + main + postrolls if any exist
        total_segments = len(concat_v_labels)
        if total_segments > 1:
            concat_str = "".join(f"{v}{a}" for v, a in zip(concat_v_labels, concat_a_labels))
            filter_complex.append(
                f"{concat_str}concat=n={total_segments}:v=1:a=1[base_v][final_a]"
            )
            current_video_label = "base_v"
        else:
            current_video_label = "main_v"
            # In single segment, route [main_a] as final_a
            filter_complex.append("[main_a]anull[final_a]")

        # ---------------------------------------------------------------------
        # 4. Overlays & Lower Third Placements (Step 5 Ads)
        # ---------------------------------------------------------------------
        for idx, (in_idx, p, path) in enumerate(overlay_inputs):
            timing = p.get("timing", {}) or {}
            anchor = timing.get("anchor", "clip_start")
            offset_sec = float(timing.get("offset_sec", 0.0))
            duration_sec = float(timing.get("duration_sec", 5.0))

            # Main clip time shifted by preroll_total
            if anchor == "clip_end":
                start_t = preroll_total + max(0.0, main_duration - offset_sec)
            else:
                start_t = preroll_total + max(0.0, offset_sec)

            end_t = min(start_t + duration_sec, preroll_total + main_duration)

            layout = p.get("layout", {}) or {}
            scale_factor = float(layout.get("scale", 0.3))
            opacity = float(layout.get("opacity", 1.0))
            margin = float(layout.get("margin", 0.05))
            position = layout.get("position", "bottom_right")
            animation = p.get("animation", "none")

            ov_lbl = f"ov_proc_{idx}"
            scale_w = int(max(32, target_w * scale_factor))

            # Scale and opacity
            filter_complex.append(
                f"[{in_idx}:v]scale={scale_w}:-1,format=rgba,colorchannelmixer=aa={opacity:.2f}[{ov_lbl}]"
            )

            # Coordinates with margins
            m_px = int(target_w * margin)
            if position == "top_left":
                x_expr, y_expr = f"{m_px}", f"{m_px}"
            elif position == "top_right":
                x_expr, y_expr = f"W-w-{m_px}", f"{m_px}"
            elif position == "bottom_left":
                x_expr, y_expr = f"{m_px}", f"H-h-{m_px}"
            elif position == "center":
                x_expr, y_expr = "(W-w)/2", "(H-h)/2"
            elif position == "custom":
                custom_x = float(layout.get("x", 0.5))
                custom_y = float(layout.get("y", 0.5))
                x_expr = f"W*{custom_x:.3f}-w/2"
                y_expr = f"H*{custom_y:.3f}-h/2"
            else:  # bottom_right (default)
                x_expr, y_expr = f"W-w-{m_px}", f"H-h-{m_px}"

            # Animations
            if animation == "slide":
                # Slide up from bottom into final y_expr
                slide_dur = 0.5
                y_expr = f"if(lt(t,{start_t + slide_dur:.3f}), H - (H - ({y_expr})) * ((t - {start_t:.3f}) / {slide_dur:.3f}), {y_expr})"

            next_video_label = f"v_after_ad_ov_{idx}"
            enable_expr = f"between(t,{start_t:.3f},{end_t:.3f})"
            filter_complex.append(
                f"[{current_video_label}][{ov_lbl}]overlay=x='{x_expr}':y='{y_expr}':enable='{enable_expr}'[{next_video_label}]"
            )
            current_video_label = next_video_label

        # ---------------------------------------------------------------------
        # 5. Assemble Filter Graph & Encoding Options
        # ---------------------------------------------------------------------
        cmd.extend(["-filter_complex", ";".join(filter_complex)])
        cmd.extend(["-map", f"[{current_video_label}]", "-map", "[final_a]"])

        # Frame rate
        if fps == 30 or fps == "30":
            cmd.extend(["-r", "30"])
        elif fps == 60 or fps == "60":
            cmd.extend(["-r", "60"])

        # Quality settings (CRF + preset)
        if is_preview or quality == "small":
            cmd.extend(["-crf", "28", "-preset", "ultrafast" if is_preview else "faster"])
        elif quality == "medium":
            cmd.extend(["-crf", "23", "-preset", "medium"])
        else:  # "high"
            cmd.extend(["-crf", "18", "-preset", "slow"])

        # Audio encoder
        cmd.extend([
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "48000",
            "-ac", "2",
        ])

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
