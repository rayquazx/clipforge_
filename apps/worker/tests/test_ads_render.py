"""
Unit tests for Phase 6 Ad Compositing in FFmpeg Graph Builder.
"""

import pytest
from app.render.graph_builder import GraphBuilder
from app.render.timeline import calculate_clip_timeline


def test_timeline_calculator_with_ads():
    """Verify timeline math with prerolls, postrolls, and main clip."""
    edit_state = {
        "schema_version": 2,
        "trim": {"start": 10.0, "end": 25.0},  # main = 15.0s
        "ads": [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "ad_asset_id": "22222222-2222-2222-2222-222222222222",
                "type": "preroll",
                "timing": {"duration_sec": 5.0},
            },
            {
                "id": "33333333-3333-3333-3333-333333333333",
                "ad_asset_id": "44444444-4444-4444-4444-444444444444",
                "type": "postroll",
                "timing": {"duration_sec": 3.5},
            },
            {
                "id": "55555555-5555-5555-5555-555555555555",
                "ad_asset_id": "66666666-6666-6666-6666-666666666666",
                "type": "overlay",
                "timing": {"offset_sec": 2.0, "duration_sec": 4.0},
            },
        ],
    }

    info = calculate_clip_timeline(edit_state)
    assert info["main_duration_sec"] == 15.0
    assert info["preroll_duration_sec"] == 5.0
    assert info["postroll_duration_sec"] == 3.5
    assert info["total_duration_sec"] == 23.5


def test_preroll_limit_exceeded():
    """Verify ValueError is raised if total preroll exceeds 30 seconds."""
    edit_state = {
        "schema_version": 2,
        "trim": {"start": 0.0, "end": 10.0},
        "ads": [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "ad_asset_id": "22222222-2222-2222-2222-222222222222",
                "type": "preroll",
                "timing": {"duration_sec": 35.0},
            }
        ],
    }

    with pytest.raises(ValueError, match="exceeds maximum allowed 30 seconds"):
        GraphBuilder.build_ffmpeg_args(
            source_path="/tmp/source.mp4",
            output_path="/tmp/output.mp4",
            edit_state=edit_state,
            resolved_ad_assets={"22222222-2222-2222-2222-222222222222": "/tmp/ad.mp4"},
        )


def test_missing_ad_asset_raises_error():
    """Verify FileNotFoundError is raised if a referenced ad file is missing."""
    edit_state = {
        "schema_version": 2,
        "trim": {"start": 0.0, "end": 10.0},
        "ads": [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "ad_asset_id": "99999999-9999-9999-9999-999999999999",
                "type": "preroll",
                "timing": {"duration_sec": 5.0},
            }
        ],
    }

    with pytest.raises(FileNotFoundError, match="Missing ad asset media file"):
        GraphBuilder.build_ffmpeg_args(
            source_path="/tmp/source.mp4",
            output_path="/tmp/output.mp4",
            edit_state=edit_state,
            resolved_ad_assets={},  # missing
        )


def test_ffmpeg_arguments_with_preroll_and_overlay():
    """Verify complex filter graph when rendering preroll ad and overlay."""
    edit_state = {
        "schema_version": 2,
        "trim": {"start": 5.0, "end": 15.0},  # main = 10.0s
        "ads": [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "ad_asset_id": "22222222-2222-2222-2222-222222222222",
                "type": "preroll",
                "timing": {"duration_sec": 4.0},
                "audio": {"volume": 0.9},
            },
            {
                "id": "33333333-3333-3333-3333-333333333333",
                "ad_asset_id": "44444444-4444-4444-4444-444444444444",
                "type": "overlay",
                "timing": {"anchor": "clip_start", "offset_sec": 1.0, "duration_sec": 3.0},
                "layout": {"position": "top_right", "scale": 0.25, "opacity": 0.85, "margin": 0.04},
                "animation": "slide",
            },
        ],
    }

    resolved = {
        "22222222-2222-2222-2222-222222222222": "/tmp/preroll.mp4",
        "44444444-4444-4444-4444-444444444444": "/tmp/badge.png",
    }

    args = GraphBuilder.build_ffmpeg_args(
        source_path="/tmp/source.mp4",
        output_path="/tmp/output.mp4",
        edit_state=edit_state,
        options={"resolution": "720p", "quality": "medium", "fps": 30},
        resolved_ad_assets=resolved,
    )

    # Must be pure list of strings
    assert isinstance(args, list)
    assert all(isinstance(a, str) for a in args)

    # Multi-input presence
    assert "-i" in args
    assert "/tmp/source.mp4" in args
    assert "/tmp/preroll.mp4" in args
    assert "/tmp/badge.png" in args

    # Check filter_complex
    assert "-filter_complex" in args
    fc_idx = args.index("-filter_complex")
    fc_str = args[fc_idx + 1]

    # Check concat
    assert "concat=n=2:v=1:a=1" in fc_str

    # Check overlay
    assert "overlay=" in fc_str
    assert "between(t,5.000,8.000)" in fc_str  # offset 1.0 shifted by preroll 4.0 -> start 5.0, duration 3.0 -> end 8.0
    assert "colorchannelmixer=aa=0.85" in fc_str

    # Check output
    assert args[-1] == "/tmp/output.mp4"
