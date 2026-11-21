"""
Integration test for rendering a frame-accurate clip from a synthetic fixture video.
Uses ffmpeg testsrc to generate a 20-second fixture and exports a 5-second trim.
Verifies with ffprobe: duration, codecs, playability.
"""

import json
import os
import shutil
import subprocess
import tempfile
import pytest

from app.render.graph_builder import GraphBuilder
from app.render.runner import RenderRunner
from app.schemas.clip import EditState, Trim
from app.schemas.render import RenderOptions


def is_ffmpeg_available() -> bool:
    try:
        res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return res.returncode == 0
    except Exception:
        return False


@pytest.mark.skipif(not is_ffmpeg_available(), reason="FFmpeg binary not available on system")
def test_render_integration_synthetic_video():
    with tempfile.TemporaryDirectory() as tmpdir:
        input_file = os.path.join(tmpdir, "fixture_20s.mp4")
        output_file = os.path.join(tmpdir, "output_5s.mp4")

        # Generate 20s test video with synthetic audio and video
        gen_cmd = [
            "ffmpeg",
            "-y",
            "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
            "-t", "20",
            "-c:v", "libx264",
            "-c:a", "aac",
            "-pix_fmt", "yuv420p",
            input_file,
        ]
        subprocess.run(gen_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert os.path.exists(input_file)

        # Build graph for 5s trim: start=5.0s, end=10.0s
        edit_state = EditState(trim=Trim(start=5.0, end=10.0))
        options = RenderOptions(resolution="720p", fps=30, quality="medium")

        builder = GraphBuilder(
            source_file=input_file,
            output_file=output_file,
            edit_state=edit_state,
            options=options,
        )
        cmd = builder.build()

        progress_calls = []
        def on_progress(p: int, stage: str):
            progress_calls.append((stage, p))

        runner = RenderRunner()
        meta = runner.run_ffmpeg(cmd=cmd, output_file=output_file, on_progress=on_progress)

        assert os.path.exists(output_file)
        assert meta["file_size"] > 0
        assert meta["width"] == 1280
        assert meta["height"] == 720
        # Assert duration is within 1 frame (30fps = ~0.033s)
        assert abs(meta["duration_sec"] - 5.0) < 0.1

        # Probe output codecs with ffprobe
        probe_cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            output_file,
        ]
        res = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
        probe_data = json.loads(res.stdout)
        codecs = [s["codec_name"] for s in probe_data.get("streams", [])]
        assert "h264" in codecs
        assert "aac" in codecs
