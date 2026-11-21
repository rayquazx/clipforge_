"""
Unit tests for Render Graph Builder and Filename Sanitization.
"""

import pytest
from app.render.graph_builder import GraphBuilder, sanitize_filename


def test_filename_sanitization():
    """Verify filename sanitization against unsafe shell and path characters."""
    assert sanitize_filename("Awesome Stream Clip! #1") == "Awesome_Stream_Clip_1.mp4"
    assert sanitize_filename("hack; rm -rf /; echo") == "hack_rm_rf_echo.mp4"
    assert sanitize_filename("  spaces  and...dots..  ") == "spaces_and_dots.mp4"
    assert sanitize_filename("") == "clip.mp4"
    assert sanitize_filename(None) == "clip.mp4"

    # Preserves already-safe .mp4 extension
    assert sanitize_filename("test_video.mp4") == "test_video.mp4"


def test_frame_accurate_cut_calculation():
    """Verify input seek pre-roll and output sub-seek calculations."""
    # When start is 10.0 and pre-roll is 2.0:
    # input_seek = 8.0, sub_seek = 2.0, duration = 15.0
    input_seek, sub_seek, dur = GraphBuilder.calculate_trim_points(10.0, 25.0)
    assert input_seek == 8.0
    assert sub_seek == 2.0
    assert dur == 15.0

    # When start is 1.0 (less than 2.0s pre-roll), input_seek must bound at 0.0:
    input_seek, sub_seek, dur = GraphBuilder.calculate_trim_points(1.0, 10.0)
    assert input_seek == 0.0
    assert sub_seek == 1.0
    assert dur == 9.0


def test_ffmpeg_arguments_structure():
    """Verify exact FFmpeg argument lists and ordering (steps 1 through 7)."""
    edit_state = {
        "schema_version": 1,
        "trim": {"start": 12.0, "end": 22.0},
    }
    options = {
        "resolution": "1080p",
        "fps": 60,
        "quality": "high",
    }
    args = GraphBuilder.build_ffmpeg_args(
        source_path="/media/source.mp4",
        output_path="/tmp/output.mp4",
        edit_state=edit_state,
        options=options,
    )

    # 1. Returned as a list of strings (no shell strings)
    assert isinstance(args, list)
    assert all(isinstance(a, str) for a in args)

    # 2. Input seek with pre-roll
    assert "-ss" in args
    idx_ss1 = args.index("-ss")
    assert args[idx_ss1 + 1] == "10.000"  # 12.0 - 2.0
    assert args[idx_ss1 + 2] == "-i"
    assert args[idx_ss1 + 3] == "/media/source.mp4"

    # 3. Output sub-seek and duration
    idx_ss2 = args.index("-ss", idx_ss1 + 1)
    assert args[idx_ss2 + 1] == "2.000"
    assert args[idx_ss2 + 2] == "-t"
    assert args[idx_ss2 + 3] == "10.000"

    # 4. Audio settings (Step 6)
    assert "-c:a" in args
    assert args[args.index("-c:a") + 1] == "aac"
    assert "-b:a" in args
    assert args[args.index("-b:a") + 1] == "128k"

    # 5. Video filters & resolution (Step 7)
    assert "-vf" in args
    assert "scale=-2:1080" in args[args.index("-vf") + 1]

    # 6. FPS
    assert "-r" in args
    assert args[args.index("-r") + 1] == "60"

    # 7. Quality high: crf 18, preset slow
    assert "-crf" in args
    assert args[args.index("-crf") + 1] == "18"
    assert "-preset" in args
    assert args[args.index("-preset") + 1] == "slow"

    # 8. Container & output
    assert "-c:v" in args
    assert args[args.index("-c:v") + 1] == "libx264"
    assert "-pix_fmt" in args
    assert args[args.index("-pix_fmt") + 1] == "yuv420p"
    assert "-movflags" in args
    assert "+faststart" in args[args.index("-movflags") + 1]
    assert args[-1] == "/tmp/output.mp4"


def test_quality_and_resolution_presets():
    """Verify small/medium quality presets and 720p scaling."""
    edit_state = {"trim": {"start": 0.0, "end": 5.0}}

    # Small quality + 720p + 30fps
    args_small = GraphBuilder.build_ffmpeg_args(
        "src.mp4", "out.mp4", edit_state, {"resolution": "720p", "fps": 30, "quality": "small"}
    )
    assert args_small[args_small.index("-crf") + 1] == "28"
    assert args_small[args_small.index("-preset") + 1] == "faster"
    assert "scale=-2:720" in args_small[args_small.index("-vf") + 1]
    assert args_small[args_small.index("-r") + 1] == "30"

    # Medium quality + original resolution + original fps
    args_med = GraphBuilder.build_ffmpeg_args(
        "src.mp4", "out.mp4", edit_state, {"resolution": "original", "fps": "original", "quality": "medium"}
    )
    assert args_med[args_med.index("-crf") + 1] == "23"
    assert args_med[args_med.index("-preset") + 1] == "medium"
    assert "-vf" not in args_med
    assert "-r" not in args_med
