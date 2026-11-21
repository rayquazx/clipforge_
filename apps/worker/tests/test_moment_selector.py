"""
Unit tests for MomentSelector: peak expansion, sentence boundary snapping,
overlap filtering, minimum gap enforcement, and mode balancing.
"""

import pytest
from app.services.moment_selector import MomentSelector, CandidateMoment
from app.services.signal_extractor import WindowSignals
from app.services.transcriber import TranscriptItem


class MockTitleGenerator:
    def generate(self, excerpt, category, language):
        return ("Test Title", "Test Reason")


class TestMomentSelector:
    def test_boundary_snapping_to_sentence_borders(self):
        selector = MomentSelector(
            min_clip_seconds=15,
            max_clip_seconds=60,
            title_generator=MockTitleGenerator(),
        )

        transcript = [
            TranscriptItem(start_sec=10.2, end_sec=15.0, text="First sentence.", avg_logprob=0.0, language="en"),
            TranscriptItem(start_sec=16.5, end_sec=28.4, text="The funniest part ever happened here!", avg_logprob=0.0, language="en"),
            TranscriptItem(start_sec=29.0, end_sec=35.1, text="Then they moved on.", avg_logprob=0.0, language="en"),
        ]

        # Raw expansion lands at 11.0s to 33.0s
        snapped_start, snapped_end = selector._snap_boundaries_to_sentences(
            raw_start=11.0, raw_end=33.0, transcript_segments=transcript
        )

        # Should snap start to 10.2s and end to 35.1s
        assert snapped_start == 10.2
        assert snapped_end == 35.1

    def test_overlap_removal_and_min_gap(self):
        selector = MomentSelector(min_gap_seconds=30.0)

        moments = [
            CandidateMoment(start_sec=10.0, end_sec=30.0, category="funny", peak_score=0.95, peak_time_sec=20.0, signals_summary={}),
            # Overlapping with first moment: should be suppressed
            CandidateMoment(start_sec=20.0, end_sec=40.0, category="funny", peak_score=0.70, peak_time_sec=30.0, signals_summary={}),
            # Inside the 30-second gap window (ends at 30, next starts at 45 -> gap is 15s < 30s): suppressed
            CandidateMoment(start_sec=45.0, end_sec=65.0, category="funny", peak_score=0.60, peak_time_sec=55.0, signals_summary={}),
            # Beyond min gap (starts at 75 -> gap is 45s > 30s): should be kept
            CandidateMoment(start_sec=75.0, end_sec=95.0, category="funny", peak_score=0.85, peak_time_sec=85.0, signals_summary={}),
        ]

        filtered = selector._filter_overlaps_and_gaps(moments, min_gap_seconds=30.0)
        assert len(filtered) == 2
        assert filtered[0].peak_score == 0.95
        assert filtered[1].peak_score == 0.85

    def test_category_balancing_in_both_mode(self):
        selector = MomentSelector()
        funny = [
            CandidateMoment(start_sec=10, end_sec=30, category="funny", peak_score=0.9, peak_time_sec=20, signals_summary={}),
            CandidateMoment(start_sec=50, end_sec=70, category="funny", peak_score=0.8, peak_time_sec=60, signals_summary={}),
        ]
        sad = [
            CandidateMoment(start_sec=90, end_sec=110, category="sad", peak_score=0.85, peak_time_sec=100, signals_summary={}),
            CandidateMoment(start_sec=130, end_sec=150, category="sad", peak_score=0.75, peak_time_sec=140, signals_summary={}),
        ]

        balanced = selector._balance_categories(funny, sad, max_clips=4)
        categories = [m.category for m in balanced]
        # Interleaved categories
        assert categories == ["funny", "sad", "funny", "sad"]
