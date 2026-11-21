"""
Integration test running the full moment detection pipeline on a synthetic 60-second audio fixture.
Asserts that moments are detected in the correct order with valid snapped timestamps
and verifies graceful operation when chat replay is unavailable.
"""

import os
import tempfile
import numpy as np
import pytest
import soundfile as sf

from app.services.moment_selector import MomentSelector
from app.services.scoring import MomentScorer
from app.services.signal_extractor import SignalExtractor, NullChatReplayProvider
from app.services.transcriber import TranscriptItem


@pytest.fixture
def sample_60s_wav(tmp_path):
    """Generate a synthetic 60-second 16kHz mono audio WAV fixture with a laughter burst at 25s."""
    sr = 16000
    duration = 60
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # Ambient low baseline noise
    signal = 0.05 * np.sin(2 * np.pi * 200 * t)

    # Add a loud laughter/energy spike between 22s and 28s
    spike_indices = (t >= 22.0) & (t <= 28.0)
    signal[spike_indices] += 0.8 * np.sin(2 * np.pi * 1500 * t[spike_indices])

    wav_path = os.path.join(tmp_path, "sample_60s.wav")
    sf.write(wav_path, signal.astype(np.float32), sr)
    return str(wav_path)


class MockTitleGenerator:
    def generate(self, excerpt, category, language):
        return (f"{category.capitalize()} Clip", f"High {category} reaction detected.")


def test_full_pipeline_on_sample_audio(sample_60s_wav):
    # 1. Mock transcript segments matching the audio
    transcript = [
        TranscriptItem(start_sec=5.0, end_sec=12.0, text="Hey chat, welcome to the stream.", avg_logprob=-0.1, language="en"),
        TranscriptItem(start_sec=20.0, end_sec=32.0, text="No way bro that is so funny haha!", avg_logprob=-0.05, language="en"),
        TranscriptItem(start_sec=40.0, end_sec=55.0, text="Alright let us move on to the next match.", avg_logprob=-0.1, language="en"),
    ]

    # 2. Signal Extraction (with NullChatReplayProvider confirming chat fallback)
    extractor = SignalExtractor(
        window_sec=5.0,
        hop_sec=2.5,
        chat_provider=NullChatReplayProvider(),
    )
    raw_windows = extractor.extract_signals(sample_60s_wav, transcript, total_duration_sec=60.0)
    assert len(raw_windows) > 10

    # Verify chat unavailable fallback was registered
    assert all(not w.chat_available for w in raw_windows)

    # 3. Moment Scoring
    scorer = MomentScorer()
    scored_windows = scorer.score_windows(raw_windows)

    # The windows overlapping with 22-28s should have highest funny score
    peak_window = max(scored_windows, key=lambda w: w.funny_score)
    assert 20.0 <= peak_window.start_sec <= 28.0

    # 4. Moment Selection
    selector = MomentSelector(
        min_clip_seconds=15,
        max_clip_seconds=30,
        min_gap_seconds=10.0,
        title_generator=MockTitleGenerator(),
    )
    moments = selector.select_moments(
        windows=scored_windows,
        transcript_segments=transcript,
        mode="funny",
        max_clips=3,
        language="en",
    )

    # 5. Assertions
    assert len(moments) >= 1
    top_moment = moments[0]
    assert top_moment.category == "funny"
    assert top_moment.peak_score > 0.5
    # Assert boundaries snap to transcript sentence borders (starts near 20s, ends near 32s)
    assert 15.0 <= top_moment.start_sec <= 25.0
    assert 30.0 <= top_moment.end_sec <= 50.0
    assert "funny haha" in top_moment.transcript_excerpt.lower()
    assert top_moment.title != ""
    assert top_moment.reason != ""
