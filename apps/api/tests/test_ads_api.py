"""
Unit tests for Phase 6 Ad Assets, Templates, Batches, and Text Renderer.
"""

import uuid
import pytest
from app.schemas.ad import (
    AdAssetCreateRequest,
    AdAssetResponse,
    AdPlacement,
    AdTemplateCreateRequest,
    AdTextConfig,
    TimelineInfoResponse,
)
from app.schemas.batch import BatchCreateRequest, BatchResponse
from app.schemas.clip import EditState
from app.services.text_ad_renderer import render_text_ad_png
from app.services.timeline_calculator import calculate_clip_timeline


def test_text_ad_rendering():
    """Verify Pillow text ad rendering with Cyrillic support and transparent PNG output."""
    text = "Скидка 50% по промокоду CLIPS!"
    png_bytes, width, height = render_text_ad_png(
        text=text,
        font_name="Roboto",
        font_size=32,
        text_color="#FFFFFF",
        stroke_color="#000000",
        bg_color="#1E1E2E",
        bg_opacity=0.9,
    )

    assert isinstance(png_bytes, bytes)
    assert len(png_bytes) > 500  # Valid PNG image bytes
    assert width > 100
    assert height > 30

    # PNG magic bytes check (89 50 4E 47 0D 0A 1A 0A)
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"


def test_ad_placement_schema_validation():
    """Verify validation of AdPlacement within EditState."""
    placement = AdPlacement(
        id=uuid.uuid4(),
        ad_asset_id=uuid.uuid4(),
        type="preroll",
        timing={"duration_sec": 5.0},
        layout={"position": "center", "scale": 0.5, "opacity": 0.9},
        animation="fade",
        audio={"volume": 0.8},
    )

    state = EditState(
        schema_version=2,
        trim={"start": 10.0, "end": 20.0},
        ads=[placement],
        extra_future_field="preserved_value",
    )

    dumped = state.model_dump()
    assert len(dumped["ads"]) == 1
    assert dumped["ads"][0]["type"] == "preroll"
    assert dumped["ads"][0]["audio"]["volume"] == 0.8
    assert dumped["extra_future_field"] == "preserved_value"


def test_batch_schema_validation():
    """Verify BatchCreateRequest and BatchResponse validation."""
    c1 = uuid.uuid4()
    c2 = uuid.uuid4()

    req = BatchCreateRequest(
        clip_ids=[c1, c2],
        options={"resolution": "1080p", "quality": "high"},
        ads_mode="append",
    )

    assert len(req.clip_ids) == 2
    assert req.ads_mode == "append"
    assert req.options.resolution == "1080p"


def test_timeline_calculator():
    """Verify single source of truth timeline calculation."""
    edit_state = {
        "trim": {"start": 5.0, "end": 20.0},
        "ads": [
            {"type": "preroll", "timing": {"duration_sec": 4.5}},
            {"type": "postroll", "timing": {"duration_sec": 3.0}},
            {"type": "overlay", "timing": {"duration_sec": 2.0}},
        ],
    }

    res = calculate_clip_timeline(edit_state)
    assert res["main_duration_sec"] == 15.0
    assert res["preroll_duration_sec"] == 4.5
    assert res["postroll_duration_sec"] == 3.0
    assert res["total_duration_sec"] == 22.5

    obj = TimelineInfoResponse.model_validate(res)
    assert obj.total_duration_sec == 22.5
