"""
ClipForge Multi-Modal Signal Extraction Service.

Computes 5-second windows (2.5s hop) combining:
- Normalized audio RMS energy, energy spikes, silence, laughter, screaming, music detection
- Transcript emotion and sentiment scoring (multilingual with reaction lexicon)
- Chat message rate & emote density (behind ChatReplayProvider interface)
"""

from __future__ import annotations

import logging
import math
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Multilingual Reaction Keywords
# ---------------------------------------------------------------------------
FUNNY_KEYWORDS = {
    # English
    "haha", "hahaha", "lol", "lmao", "lmfao", "rofl", "hilarious", "died",
    "dead", "no way", "bro", "bruh", "what the", "wtf", "are you kidding",
    "you joking", "i can't", "cant breathe", "so funny", "joke", "jebaited",
    # Spanish
    "jaja", "jajaja", "no mames", "que risa", "morí", "me muero",
    # German
    "hahaha", "lachkick", "ich kann nicht mehr", "wie geil",
    # French
    "mdr", "ptdr", "trop drole", "mort de rire",
}

SAD_KEYWORDS = {
    # English
    "sad", "crying", "tears", "rip", "rest in peace", "unfortunate",
    "depressing", "heartbreaking", "miss you", "miss him", "miss her",
    "why", "so sad", "pain", "not like this", "despair", "broken",
    # Spanish
    "triste", "llorando", "depresivo", "descanse en paz", "dolor",
    # German
    "traurig", "weinen", "ruhe in frieden", "schade",
    # French
    "triste", "pleure", "repose en paix", "dommage",
}


@dataclass
class WindowSignals:
    """Features extracted for a single 5-second window."""
    start_sec: float
    end_sec: float
    audio_energy: float = 0.0
    energy_spike: float = 0.0
    laughter_score: float = 0.0
    scream_score: float = 0.0
    silence_score: float = 0.0
    is_music: bool = False
    chat_rate: float = 0.0
    emote_score: float = 0.0
    chat_available: bool = False
    sentiment_pos: float = 0.0
    sentiment_neg: float = 0.0
    joy_score: float = 0.0
    sadness_score: float = 0.0
    surprise_score: float = 0.0
    reaction_keywords: List[str] = None


class ChatReplayProvider(ABC):
    """Abstract interface for Twitch / YouTube / Kick chat replay."""

    @abstractmethod
    def get_messages_in_window(
        self, start_sec: float, end_sec: float
    ) -> Tuple[int, int, float, bool]:
        """
        Returns (msg_count, emote_count, emote_density, is_available).
        """
        pass


class NullChatReplayProvider(ChatReplayProvider):
    """Default fallback when chat replay is unavailable."""

    def get_messages_in_window(
        self, start_sec: float, end_sec: float
    ) -> Tuple[int, int, float, bool]:
        return (0, 0, 0.0, False)


class SignalExtractor:
    """
    Extracts time-aligned audio, text, and chat features across a video.
    """

    def __init__(
        self,
        window_sec: float = 5.0,
        hop_sec: float = 2.5,
        chat_provider: Optional[ChatReplayProvider] = None,
    ):
        self.window_sec = window_sec
        self.hop_sec = hop_sec
        self.chat_provider = chat_provider or NullChatReplayProvider()

    def extract_signals(
        self,
        wav_path: str,
        transcript_items: List[Any],
        total_duration_sec: Optional[float] = None,
    ) -> List[WindowSignals]:
        """
        Process the entire audio WAV file and transcript to yield windowed signals.
        """
        # 1. Load audio with librosa or soundfile
        audio_signals_by_window = self._extract_audio_signals(wav_path, total_duration_sec)

        windows: List[WindowSignals] = []
        num_windows = len(audio_signals_by_window)

        for i, (start_sec, end_sec, audio_feat) in enumerate(audio_signals_by_window):
            # 2. Text / transcript signals for this window
            text_feat = self._extract_text_signals_for_window(
                start_sec, end_sec, transcript_items
            )

            # 3. Chat replay signals for this window
            msg_count, emote_count, emote_density, chat_avail = self.chat_provider.get_messages_in_window(
                start_sec, end_sec
            )
            chat_rate = msg_count / max(1.0, (end_sec - start_sec))

            win = WindowSignals(
                start_sec=start_sec,
                end_sec=end_sec,
                audio_energy=audio_feat["energy"],
                energy_spike=audio_feat["energy_spike"],
                laughter_score=audio_feat["laughter"],
                scream_score=audio_feat["scream"],
                silence_score=audio_feat["silence"],
                is_music=audio_feat["is_music"],
                chat_rate=chat_rate,
                emote_score=emote_density,
                chat_available=chat_avail,
                sentiment_pos=text_feat["sentiment_pos"],
                sentiment_neg=text_feat["sentiment_neg"],
                joy_score=text_feat["joy"],
                sadness_score=text_feat["sadness"],
                surprise_score=text_feat["surprise"],
                reaction_keywords=text_feat["keywords"],
            )
            windows.append(win)

        return windows

    def _extract_audio_signals(
        self, wav_path: str, total_duration_sec: Optional[float]
    ) -> List[Tuple[float, float, Dict[str, Any]]]:
        """
        Read audio samples and compute RMS energy, rolling z-score, spikes,
        laughter heuristics, screams, and sudden silence gaps.
        """
        import soundfile as sf

        data, sr = sf.read(wav_path, dtype="float32")
        if data.ndim > 1:
            data = np.mean(data, axis=1)

        total_samples = len(data)
        duration = total_samples / sr if sr > 0 else 0.0

        if total_duration_sec is not None and total_duration_sec > duration:
            duration = total_duration_sec

        window_samples = int(self.window_sec * sr)
        hop_samples = int(self.hop_sec * sr)

        results = []
        raw_energies = []
        raw_centroids = []
        raw_flatness = []

        # First pass: compute window raw metrics
        curr = 0
        starts = []
        while curr < total_samples:
            end = min(total_samples, curr + window_samples)
            segment = data[curr:end]

            # RMS Energy
            rms = float(np.sqrt(np.mean(segment**2))) if len(segment) > 0 else 0.0
            raw_energies.append(rms)

            # Spectral features
            fft_mag = np.abs(np.fft.rfft(segment)) if len(segment) > 128 else np.array([0.0])
            freqs = np.fft.rfftfreq(len(segment), 1.0 / sr) if len(segment) > 128 else np.array([0.0])

            # Spectral Centroid (frequency brightness - high for screams)
            sum_mag = np.sum(fft_mag)
            centroid = float(np.sum(freqs * fft_mag) / sum_mag) if sum_mag > 1e-6 else 0.0
            raw_centroids.append(centroid)

            # Spectral Flatness (music tends to have lower flatness than noisy speech/laughter)
            geom_mean = np.exp(np.mean(np.log(fft_mag + 1e-8)))
            arith_mean = np.mean(fft_mag) + 1e-8
            flatness = float(geom_mean / arith_mean)
            raw_flatness.append(flatness)

            starts.append(curr / sr)
            curr += hop_samples

        if not raw_energies:
            return []

        # Rolling normalization (z-score) so quiet streamers are normalized against their baseline
        energies_arr = np.array(raw_energies)
        mean_e = np.mean(energies_arr)
        std_e = np.std(energies_arr) + 1e-6
        norm_energies = (energies_arr - mean_e) / std_e
        # Clip and map z-score to 0.0 - 1.0
        norm_energies = np.clip((norm_energies + 2.0) / 4.0, 0.0, 1.0)

        # Second pass: compute derivatives, laughter, scream, and silence
        for i, start_s in enumerate(starts):
            end_s = min(duration, start_s + self.window_sec)
            curr_e = norm_energies[i]
            prev_e = norm_energies[i - 1] if i > 0 else curr_e

            # Energy spike (positive derivative)
            energy_spike = max(0.0, curr_e - prev_e)

            # Scream detection: high energy + high spectral centroid (> 2500 Hz)
            centroid = raw_centroids[i]
            scream_score = 0.0
            if curr_e > 0.6 and centroid > 2200.0:
                scream_score = min(1.0, (curr_e * 0.6) + ((centroid - 2200.0) / 3000.0))

            # Laughter detection heuristic: bursts of mid-frequency modulation + moderate energy
            # Alternating rhythm and high spectral flatness
            flatness = raw_flatness[i]
            laughter_score = 0.0
            if 0.25 <= curr_e <= 0.85 and 1000.0 <= centroid <= 3500.0:
                laughter_score = min(1.0, (curr_e * 0.5) + (flatness * 0.5))

            # Silence score: low energy window that directly follows a high energy or emotional window
            silence_score = 0.0
            if curr_e < 0.15:
                # check if preceding 10-15s had high emotion/energy
                lookback = max(0, i - 4)
                recent_max = np.max(norm_energies[lookback:i]) if i > 0 else 0.0
                if recent_max > 0.6:
                    silence_score = min(1.0, (0.2 - curr_e) * 3.0 + (recent_max * 0.5))

            # Music detection flag: sustained harmonic peaks with low flatness
            is_music = flatness < 0.1 and curr_e > 0.4 and scream_score < 0.2

            results.append((
                start_s,
                end_s,
                {
                    "energy": float(curr_e),
                    "energy_spike": float(energy_spike),
                    "laughter": float(laughter_score),
                    "scream": float(scream_score),
                    "silence": float(silence_score),
                    "is_music": bool(is_music),
                },
            ))

        return results

    def _extract_text_signals_for_window(
        self, start_sec: float, end_sec: float, transcript_items: List[Any]
    ) -> Dict[str, Any]:
        """
        Aggregate transcript segments that overlap with [start_sec, end_sec].
        Evaluates sentiment, joy/sadness/surprise, and reaction keywords.
        """
        overlapping_texts = []
        for item in transcript_items:
            i_start = getattr(item, "start_sec", None)
            if i_start is None:
                i_start = getattr(item, "start_time", 0.0)
            i_end = getattr(item, "end_sec", None)
            if i_end is None:
                i_end = getattr(item, "end_time", 0.0)
            text = getattr(item, "text", "")

            # Check overlap
            if not (i_end < start_sec or i_start > end_sec):
                overlapping_texts.append(text)

        joined_text = " ".join(overlapping_texts).lower()
        if not joined_text:
            return {
                "sentiment_pos": 0.0,
                "sentiment_neg": 0.0,
                "joy": 0.0,
                "sadness": 0.0,
                "surprise": 0.0,
                "keywords": [],
            }

        found_keywords = []
        joy_hits = 0
        sad_hits = 0

        # Scan for reaction keywords
        for kw in FUNNY_KEYWORDS:
            if re.search(rf"\b{re.escape(kw)}\b", joined_text):
                found_keywords.append(kw)
                joy_hits += 1

        for kw in SAD_KEYWORDS:
            if re.search(rf"\b{re.escape(kw)}\b", joined_text):
                found_keywords.append(kw)
                sad_hits += 1

        # Check exclamation and question marks for surprise
        excl_count = joined_text.count("!")
        surprise_score = min(1.0, (excl_count * 0.25) + (0.3 if "what" in joined_text else 0.0))

        sentiment_pos = min(1.0, joy_hits * 0.35 + (0.2 if excl_count > 0 else 0.0))
        sentiment_neg = min(1.0, sad_hits * 0.40)

        joy_score = sentiment_pos
        sadness_score = sentiment_neg

        return {
            "sentiment_pos": float(sentiment_pos),
            "sentiment_neg": float(sentiment_neg),
            "joy": float(joy_score),
            "sadness": float(sadness_score),
            "surprise": float(surprise_score),
            "keywords": found_keywords,
        }
