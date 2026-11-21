"""
Unit tests for Phase 4 EditState and Trim boundary validation.
"""

import pytest
from pydantic import ValidationError
from app.schemas.clip import EditState, Trim


def test_valid_edit_state():
    """Verify valid edit_state passes validation."""
    data = {
        "schema_version": 1,
        "trim": {"start": 10.5, "end": 25.0},
    }
    state = EditState.model_validate(data)
    assert state.schema_version == 1
    assert state.trim.start == 10.5
    assert state.trim.end == 25.0


def test_edit_state_preserves_unknown_keys():
    """
    Contract requirement:
    'Unknown future keys must be preserved, not dropped.'
    """
    data = {
        "schema_version": 1,
        "trim": {"start": 5.0, "end": 20.0},
        "reframe": {"aspect": "9:16", "mode": "center_crop"},
        "subtitles": {"enabled": True, "style": "karaoke_v2"},
        "future_ad_break": {"timestamp": 12.5},
    }
    state = EditState.model_validate(data)
    dumped = state.model_dump()

    assert dumped["schema_version"] == 1
    assert dumped["trim"]["start"] == 5.0
    assert dumped["reframe"]["aspect"] == "9:16"
    assert dumped["subtitles"]["enabled"] is True
    assert dumped["future_ad_break"]["timestamp"] == 12.5


def test_trim_requires_start_and_end():
    """Verify missing start or end raises validation error."""
    with pytest.raises(ValidationError):
        Trim.model_validate({"start": 10.0})

    with pytest.raises(ValidationError):
        Trim.model_validate({"end": 20.0})
