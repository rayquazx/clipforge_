"""
ClipForge Speech-to-Text Transcription Service.

Uses faster-whisper with VAD filtering, word-level timestamps,
language autodetection (or manual override), and progress emission.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class TranscriptItem:
    """A single transcribed speech segment with global timing."""
    start_sec: float
    end_sec: float
    text: str
    avg_logprob: float
    language: str
    word_timestamps: Optional[List[dict]] = None


class Transcriber(ABC):
    """Abstract speech-to-text interface."""

    @abstractmethod
    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        global_offset_sec: float = 0.0,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> List[TranscriptItem]:
        pass


class FasterWhisperTranscriber(Transcriber):
    """
    faster-whisper implementation.
    Loads model lazily, detects GPU/CUDA or defaults to CPU int8.
    """

    def __init__(
        self,
        model_size: Optional[str] = None,
        device: Optional[str] = None,
        compute_type: Optional[str] = None,
    ):
        self.model_size = model_size or os.getenv("WHISPER_MODEL", "small")
        self.device = device or ("cuda" if self._has_cuda() else "cpu")
        self.compute_type = compute_type or ("float16" if self.device == "cuda" else "int8")
        self._model = None

    def _has_cuda(self) -> bool:
        try:
            import torch
            return torch.cuda.is_available()
        except Exception:
            return False

    def _load_model(self):
        if self._model is None:
            logger.info(
                f"Loading faster-whisper model '{self.model_size}' on {self.device} ({self.compute_type})..."
            )
            from faster_whisper import WhisperModel
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
        return self._model

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        global_offset_sec: float = 0.0,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> List[TranscriptItem]:
        """
        Transcribe audio file into TranscriptItem segments.
        Applies global_offset_sec so chunked transcriptions seamlessly stitch together.
        """
        model = self._load_model()
        lang_arg = None if (not language or language.lower() == "auto") else language

        segments_iter, info = model.transcribe(
            audio_path,
            language=lang_arg,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            word_timestamps=True,
        )

        detected_lang = info.language or "en"
        results: List[TranscriptItem] = []
        total_duration = info.duration or 1.0

        for seg in segments_iter:
            words = []
            if seg.words:
                for w in seg.words:
                    words.append({
                        "word": w.word,
                        "start": w.start + global_offset_sec,
                        "end": w.end + global_offset_sec,
                        "probability": w.probability,
                    })

            item = TranscriptItem(
                start_sec=seg.start + global_offset_sec,
                end_sec=seg.end + global_offset_sec,
                text=seg.text.strip(),
                avg_logprob=seg.avg_logprob,
                language=detected_lang,
                word_timestamps=words,
            )
            results.append(item)

            if progress_callback and total_duration > 0:
                fraction = min(1.0, seg.end / total_duration)
                progress_callback(fraction)

        return results
