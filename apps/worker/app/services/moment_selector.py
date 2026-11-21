"""
ClipForge Moment Selection Service.

Finds score peaks using scipy.signal.find_peaks, expands peaks into clip windows,
snaps boundaries to speech sentence borders, removes overlaps, balances categories,
and generates AI-powered titles and reasons.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy.signal import find_peaks

from app.services.signal_extractor import WindowSignals

logger = logging.getLogger(__name__)


@dataclass
class CandidateMoment:
    start_sec: float
    end_sec: float
    category: str
    peak_score: float
    peak_time_sec: float
    signals_summary: Dict[str, Any]
    transcript_excerpt: str = ""
    title: str = ""
    reason: str = ""


class TitleGenerator(ABC):
    """Abstract interface for generating clip titles and summary reasons."""

    @abstractmethod
    def generate(
        self, transcript_excerpt: str, category: str, language: str
    ) -> Tuple[str, str]:
        """Returns (title, reason)."""
        pass


class AnthropicTitleGenerator(TitleGenerator):
    """
    Generates concise titles using the Anthropic API (Claude 3.5 Sonnet / Haiku).
    Falls back gracefully to template-based extraction if key is not configured.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self._cache: Dict[str, Tuple[str, str]] = {}

    def generate(
        self, transcript_excerpt: str, category: str, language: str
    ) -> Tuple[str, str]:
        clean_text = transcript_excerpt.strip()
        if not clean_text:
            return (
                f"Peak {category.capitalize()} Stream Moment",
                f"High-confidence {category} peak detected from stream signals.",
            )

        cache_key = f"{category}:{clean_text[:100]}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        if not self.api_key:
            return self._fallback_template(clean_text, category)

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)
            prompt = (
                f"You are an editor for viral stream clips. Given this transcript excerpt of a {category} moment in {language}, "
                f"generate:\n1. A title of at most 8 words in {language} describing what happened without clickbait.\n"
                f"2. A one-line reason (under 12 words) describing why it is {category}.\n"
                f"Format your response as:\nTITLE: <title>\nREASON: <reason>\n\nExcerpt:\n{clean_text}"
            )
            message = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=100,
                temperature=0.3,
                messages=[{"role": "user", "content": prompt}],
            )
            response_text = message.content[0].text
            title = ""
            reason = ""
            for line in response_text.splitlines():
                if line.startswith("TITLE:"):
                    title = line.replace("TITLE:", "").strip()
                elif line.startswith("REASON:"):
                    reason = line.replace("REASON:", "").strip()

            if not title:
                title = clean_text[:40].capitalize()
            if not reason:
                reason = f"Intense {category} reaction detected in stream audio."

            self._cache[cache_key] = (title, reason)
            return (title, reason)

        except Exception as exc:
            logger.warning(f"Anthropic title generation failed: {exc}, using template fallback.")
            return self._fallback_template(clean_text, category)

    def _fallback_template(self, clean_text: str, category: str) -> Tuple[str, str]:
        # Extract first punchy sentence or words
        words = clean_text.split()
        title_words = words[:7]
        title = " ".join(title_words).strip(".,!?:;")
        if title:
            title = title[0].upper() + title[1:]
        else:
            title = f"{category.capitalize()} Highlight Moment"

        if category == "funny":
            reason = "Laughter and energy spike detected with positive sentiment."
        else:
            reason = "Emotional pause and sad sentiment detected in speech."

        return (title, reason)


class MomentSelector:
    """
    Selects, expands, snaps boundaries, filters overlaps, and balances moments.
    """

    def __init__(
        self,
        min_clip_seconds: int = 15,
        max_clip_seconds: int = 60,
        min_gap_seconds: float = 30.0,
        title_generator: Optional[TitleGenerator] = None,
    ):
        self.min_clip_seconds = min_clip_seconds
        self.max_clip_seconds = max_clip_seconds
        self.min_gap_seconds = min_gap_seconds
        self.title_generator = title_generator or AnthropicTitleGenerator()

    def select_moments(
        self,
        windows: List[WindowSignals],
        transcript_segments: List[Any],
        mode: str = "both",
        max_clips: int = 10,
        language: str = "en",
    ) -> List[CandidateMoment]:
        if not windows:
            return []

        # 1. Find peaks for funny and sad categories
        funny_candidates = self._find_and_expand_peaks(
            windows, "funny", transcript_segments
        )
        sad_candidates = self._find_and_expand_peaks(
            windows, "sad", transcript_segments
        )

        # 2. Select candidates based on mode
        selected: List[CandidateMoment] = []
        target_mode = mode.lower()

        if target_mode == "funny":
            selected = funny_candidates
        elif target_mode == "sad":
            selected = sad_candidates
        else:  # "both" -> balance categories
            selected = self._balance_categories(
                funny_candidates, sad_candidates, max_clips
            )

        # 3. Non-maximum suppression: remove overlapping moments and enforce min_gap_seconds
        filtered = self._filter_overlaps_and_gaps(selected, self.min_gap_seconds)

        # 4. Trim to max_clips
        top_moments = filtered[:max_clips]

        # 5. Populate transcript excerpt, AI title, and reason for top moments
        for m in top_moments:
            excerpt = self._extract_transcript_excerpt(
                m.start_sec, m.end_sec, transcript_segments
            )
            m.transcript_excerpt = excerpt
            title, reason = self.title_generator.generate(excerpt, m.category, language)
            m.title = title
            m.reason = reason

        return top_moments

    def _find_and_expand_peaks(
        self,
        windows: List[WindowSignals],
        category: str,
        transcript_segments: List[Any],
    ) -> List[CandidateMoment]:
        scores = np.array([
            w.funny_score if category == "funny" else w.sad_score for w in windows
        ])
        times = np.array([w.start_sec for w in windows])

        if len(scores) < 3 or np.max(scores) < 0.15:
            return []

        # Minimum distance between peaks: at least 3 windows (~7.5s)
        peaks, props = find_peaks(scores, prominence=0.15, distance=3)
        candidates: List[CandidateMoment] = []

        for p_idx in peaks:
            peak_val = float(scores[p_idx])
            peak_time = float(times[p_idx])

            # Expand backwards until score falls below 40% of peak or min threshold
            cutoff = max(0.10, peak_val * 0.40)
            left_idx = p_idx
            while left_idx > 0 and scores[left_idx] > cutoff:
                if (times[p_idx] - times[left_idx]) >= (self.max_clip_seconds / 2.0):
                    break
                left_idx -= 1

            # Expand forwards until reaction subsides
            right_idx = p_idx
            while right_idx < len(scores) - 1 and scores[right_idx] > cutoff:
                if (times[right_idx] - times[left_idx]) >= self.max_clip_seconds:
                    break
                right_idx += 1

            raw_start = float(times[left_idx])
            raw_end = float(times[right_idx]) + (windows[right_idx].end_sec - windows[right_idx].start_sec)

            # Enforce min duration before boundary snapping
            if (raw_end - raw_start) < self.min_clip_seconds:
                pad = (self.min_clip_seconds - (raw_end - raw_start)) / 2.0
                raw_start = max(0.0, raw_start - pad)
                raw_end = raw_end + pad

            # Snap boundaries to transcript sentences
            snapped_start, snapped_end = self._snap_boundaries_to_sentences(
                raw_start, raw_end, transcript_segments
            )

            # Re-clamp to min/max clip bounds
            clip_dur = snapped_end - snapped_start
            if clip_dur > self.max_clip_seconds:
                snapped_end = snapped_start + self.max_clip_seconds
            elif clip_dur < self.min_clip_seconds:
                snapped_end = min(times[-1] + 5.0, snapped_start + self.min_clip_seconds)

            summary = {
                "peak_score": peak_val,
                "laughter": float(windows[p_idx].laughter_score),
                "energy_spike": float(windows[p_idx].energy_spike),
                "scream": float(windows[p_idx].scream_score),
                "silence": float(windows[p_idx].silence_score),
                "keywords": windows[p_idx].reaction_keywords or [],
            }

            candidates.append(
                CandidateMoment(
                    start_sec=round(snapped_start, 2),
                    end_sec=round(snapped_end, 2),
                    category=category,
                    peak_score=round(peak_val, 3),
                    peak_time_sec=round(peak_time, 2),
                    signals_summary=summary,
                )
            )

        # Sort candidates descending by peak score
        candidates.sort(key=lambda m: m.peak_score, reverse=True)
        return candidates

    def _snap_boundaries_to_sentences(
        self,
        raw_start: float,
        raw_end: float,
        transcript_segments: List[Any],
    ) -> Tuple[float, float]:
        """
        Snap raw start and end times to the closest transcript sentence borders
        so speech is never abruptly chopped mid-sentence.
        """
        if not transcript_segments:
            return (raw_start, raw_end)

        snapped_start = raw_start
        snapped_end = raw_end

        # Search for closest sentence start before or near raw_start (tolerance ± 4 sec)
        best_start_diff = 4.0
        for seg in transcript_segments:
            s_start = getattr(seg, "start_sec", getattr(seg, "start_time", 0.0))
            diff = abs(s_start - raw_start)
            if diff < best_start_diff:
                best_start_diff = diff
                snapped_start = s_start

        # Search for closest sentence end after or near raw_end (tolerance ± 4 sec)
        best_end_diff = 4.0
        for seg in transcript_segments:
            s_end = getattr(seg, "end_sec", getattr(seg, "end_time", 0.0))
            diff = abs(s_end - raw_end)
            if diff < best_end_diff:
                best_end_diff = diff
                snapped_end = s_end

        return (max(0.0, snapped_start), snapped_end)

    def _filter_overlaps_and_gaps(
        self, moments: List[CandidateMoment], min_gap_seconds: float
    ) -> List[CandidateMoment]:
        """
        Non-maximum suppression: keep higher score when moments overlap
        or are closer than min_gap_seconds.
        """
        sorted_by_score = sorted(moments, key=lambda m: m.peak_score, reverse=True)
        kept: List[CandidateMoment] = []

        for cand in sorted_by_score:
            has_conflict = False
            for existing in kept:
                # Check overlap or gap distance
                if not (
                    cand.end_sec + min_gap_seconds < existing.start_sec
                    or cand.start_sec > existing.end_sec + min_gap_seconds
                ):
                    has_conflict = True
                    break

            if not has_conflict:
                kept.append(cand)

        # Re-sort chronologically or keep by score
        kept.sort(key=lambda m: m.peak_score, reverse=True)
        return kept

    def _balance_categories(
        self,
        funny: List[CandidateMoment],
        sad: List[CandidateMoment],
        max_clips: int,
    ) -> List[CandidateMoment]:
        """
        In 'both' mode, balance funny and sad clips so neither category dominates.
        Interleaves top candidates from both pools.
        """
        combined: List[CandidateMoment] = []
        f_idx = 0
        s_idx = 0

        while len(combined) < (max_clips * 2) and (f_idx < len(funny) or s_idx < len(sad)):
            if f_idx < len(funny):
                combined.append(funny[f_idx])
                f_idx += 1
            if s_idx < len(sad):
                combined.append(sad[s_idx])
                s_idx += 1

        return combined

    def _extract_transcript_excerpt(
        self, start_sec: float, end_sec: float, transcript_segments: List[Any]
    ) -> str:
        texts = []
        for seg in transcript_segments:
            s_start = getattr(seg, "start_sec", getattr(seg, "start_time", 0.0))
            s_end = getattr(seg, "end_sec", getattr(seg, "end_time", 0.0))
            text = getattr(seg, "text", "")
            if not (s_end < start_sec or s_start > end_sec):
                texts.append(text)
        return " ".join(texts)
