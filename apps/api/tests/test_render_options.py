"""
Unit tests for RenderOptions schema validation.
"""

import pytest
from pydantic import ValidationError
from app.schemas.render import RenderOptions


def test_default_render_options():
    """Verify default values match contract specification."""
    options = RenderOptions()
    assert options.resolution == "original"
    assert options.fps == "original"
    assert options.quality == "high"
    assert options.filename is None


def test_valid_custom_render_options():
    """Verify customized valid options."""
    opt1 = RenderOptions(resolution="1080p", fps=60, quality="medium", filename="my_clip.mp4")
    assert opt1.resolution == "1080p"
    assert opt1.fps == 60
    assert opt1.quality == "medium"
    assert opt1.filename == "my_clip.mp4"

    opt2 = RenderOptions(resolution="720p", fps=30, quality="small")
    assert opt2.resolution == "720p"
    assert opt2.fps == 30
    assert opt2.quality == "small"


def test_invalid_render_options():
    """Verify invalid resolutions, fps, or qualities raise validation errors."""
    with pytest.raises(ValidationError):
        RenderOptions(resolution="4k")

    with pytest.raises(ValidationError):
        RenderOptions(fps=120)

    with pytest.raises(ValidationError):
        RenderOptions(quality="ultra")
