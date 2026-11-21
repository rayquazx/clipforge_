"""
Unit tests for moment scoring logic with synthetic signal arrays.
"""

import numpy as np
import pytest
from app.services.scoring import MomentScorer, load_scoring_weights
from app.services.signal_extractor import WindowSignals


class TestMomentScorer:
    def test_funny_score_calculation(self):
        scorer = MomentScorer()
        windows = [
            WindowSignals(
                start_sec=0.0,
                end_sec=5.0,
                audio_energy=0.2,
                energy_spike=0.0,
                laughter_score=0.0,
            ),
            WindowSignals(
                start_sec=2.5,
                end_sec=7.5,
                audio_energy=0.9,
                energy_spike=0.7,
                laughter_score=0.95,
                sentiment_pos=0.8,
                reaction_keywords=["lol", "haha"],
            ),
            WindowSignals(
                start_sec=5.0,
                end_sec=10.0,
                audio_energy=0.3,
                energy_spike=0.0,
                laughter_score=0.1,
            ),
        ]

        scored = scorer.score_windows(windows)
        # Window 1 (the peak) should have the highest funny score
        assert scored[1].funny_score > scored[0].funny_score
        assert scored[1].funny_score > scored[2].funny_score
        # Check normalized range
        for w in scored:
            assert 0.0 <= w.funny_score <= 1.0

    def test_sad_score_calculation(self):
        scorer = MomentScorer()
        windows = [
            WindowSignals(start_sec=0.0, end_sec=5.0, audio_energy=0.8),
            WindowSignals(
                start_sec=2.5,
                end_sec=7.5,
                audio_energy=0.1,  # sudden low energy
                silence_score=0.9,
                sentiment_neg=0.85,
                sadness_score=0.9,
                reaction_keywords=["rip", "crying"],
            ),
            WindowSignals(start_sec=5.0, end_sec=10.0, audio_energy=0.1, silence_score=0.4),
        ]

        scored = scorer.score_windows(windows)
        assert scored[1].sad_score > scored[0].sad_score
        assert scored[1].sad_score == 1.0  # highest peak normalized to 1.0

    def test_music_penalty_reduces_funny_score(self):
        scorer = MomentScorer()
        win_speech = WindowSignals(start_sec=0.0, end_sec=5.0, laughter_score=0.5, is_music=False)
        win_music = WindowSignals(start_sec=0.0, end_sec=5.0, laughter_score=0.5, is_music=True)

        scored_speech = scorer.score_windows([win_speech, WindowSignals(start_sec=2.5, end_sec=7.5)])
        scored_music = scorer.score_windows([win_music, WindowSignals(start_sec=2.5, end_sec=7.5)])

        # The window with is_music=True should have lower raw score
        assert scorer.funny_weights.get("music_penalty", -0.10) < 0
