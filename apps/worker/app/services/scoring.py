"""
ClipForge Moment Scoring Service.

Computes weighted composite scores for "funny" and "sad" categories,
applies moving average smoothing over time, and normalizes scores (0.0 - 1.0).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import yaml

from app.services.signal_extractor import WindowSignals


def load_scoring_weights(config_path: str | None = None) -> Dict[str, Any]:
    """Load scoring weights from YAML file or return defaults."""
    if not config_path:
        default_p = Path(__file__).resolve().parent.parent.parent / "config" / "scoring.yaml"
        if default_p.exists():
            config_path = str(default_p)
        else:
            root_p = Path(__file__).resolve().parent.parent.parent / "scoring_config.yaml"
            config_path = str(root_p) if root_p.exists() else None

    if config_path and os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
            if "funny" in data:
                return data

    # Default fallback weights matching specification
    return {
        "funny": {
            "audio_laughter": 0.30,
            "audio_energy_spike": 0.20,
            "audio_scream": 0.10,
            "chat_rate_spike": 0.15,
            "chat_funny_emotes": 0.15,
            "transcript_positive_sentiment": 0.05,
            "transcript_reaction_keywords": 0.05,
            "music_penalty": -0.10,
        },
        "sad": {
            "transcript_negative_sentiment": 0.30,
            "transcript_sad_keywords": 0.20,
            "audio_sudden_silence": 0.15,
            "audio_soft_energy": 0.10,
            "chat_sad_emotes": 0.15,
            "chat_rate_spike": 0.10,
        },
        "smoothing": {
            "moving_average_window": 3,
        },
        "thresholds": {
            "min_peak_prominence": 0.20,
            "expansion_cutoff_ratio": 0.40,
        },
    }


class MomentScorer:
    """Computes, smooths, and normalizes funny and sad scores across windows."""

    def __init__(self, config: Dict[str, Any] | None = None):
        self.config = config or load_scoring_weights()
        self.funny_weights = self.config.get("funny", {})
        self.sad_weights = self.config.get("sad", {})
        self.smooth_window = int(
            self.config.get("smoothing", {}).get("moving_average_window", 3)
        )

    def score_windows(self, windows: List[WindowSignals]) -> List[WindowSignals]:
        """
        Evaluate raw scores for all windows, apply moving average smoothing,
        and normalize to 0.0 - 1.0. Mutates windows and returns them.
        """
        if not windows:
            return []

        raw_funny = []
        raw_sad = []

        for w in windows:
            # --- 1. Compute Funny Score ---
            f_score = 0.0
            f_score += self.funny_weights.get("audio_laughter", 0.30) * w.laughter_score
            f_score += self.funny_weights.get("audio_energy_spike", 0.20) * w.energy_spike
            f_score += self.funny_weights.get("audio_scream", 0.10) * w.scream_score
            f_score += self.funny_weights.get("chat_rate_spike", 0.15) * min(1.0, w.chat_rate)
            f_score += self.funny_weights.get("chat_funny_emotes", 0.15) * w.emote_score
            f_score += self.funny_weights.get("transcript_positive_sentiment", 0.05) * max(w.sentiment_pos, w.joy_score)
            f_score += self.funny_weights.get("transcript_reaction_keywords", 0.05) * (0.5 if w.reaction_keywords else 0.0)

            # Apply music penalty if flagged
            if w.is_music:
                f_score += self.funny_weights.get("music_penalty", -0.10)

            raw_funny.append(max(0.0, f_score))

            # --- 2. Compute Sad Score ---
            s_score = 0.0
            s_score += self.sad_weights.get("transcript_negative_sentiment", 0.30) * max(w.sentiment_neg, w.sadness_score)
            s_score += self.sad_weights.get("transcript_sad_keywords", 0.20) * (0.8 if w.reaction_keywords and w.sadness_score > 0.1 else 0.0)
            s_score += self.sad_weights.get("audio_sudden_silence", 0.15) * w.silence_score
            s_score += self.sad_weights.get("audio_soft_energy", 0.10) * (0.4 if 0.05 <= w.audio_energy <= 0.25 else 0.0)
            s_score += self.sad_weights.get("chat_sad_emotes", 0.15) * w.emote_score
            s_score += self.sad_weights.get("chat_rate_spike", 0.10) * min(1.0, w.chat_rate)

            raw_sad.append(max(0.0, s_score))

        # --- 3. Moving Average Smoothing ---
        smooth_f = self._moving_average(raw_funny, self.smooth_window)
        smooth_s = self._moving_average(raw_sad, self.smooth_window)

        # --- 4. Per-Video Normalization (0.0 to 1.0) ---
        norm_f = self._normalize_array(smooth_f)
        norm_s = self._normalize_array(smooth_s)

        # Assign back to window instances
        for i, w in enumerate(windows):
            w.funny_score = float(norm_f[i])
            w.sad_score = float(norm_s[i])

        return windows

    def _moving_average(self, values: List[float], window_size: int) -> np.ndarray:
        if len(values) < window_size:
            return np.array(values, dtype=float)

        arr = np.array(values, dtype=float)
        # Pad edges using reflection to avoid edge attenuation
        pad_width = window_size // 2
        padded = np.pad(arr, pad_width, mode="edge")
        kernel = np.ones(window_size) / window_size
        smoothed = np.convolve(padded, kernel, mode="valid")
        return smoothed[:len(values)]

    def _normalize_array(self, arr: np.ndarray) -> np.ndarray:
        min_v = np.min(arr)
        max_v = np.max(arr)
        if max_v - min_v < 1e-6:
            return np.zeros_like(arr)
        return (arr - min_v) / (max_v - min_v)
