"use client";

import * as React from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Repeat,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { apiClient } from "@/lib/api";
import {
  sourceToPreviewTime,
  previewToSourceTime,
  formatTimestamp,
  clamp,
} from "@/lib/time-mapping";
import { Button } from "@/components/ui/Button";

export function EditorPlayer() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const clip = useEditorStore((s) => s.clip);
  const previewStatus = useEditorStore((s) => s.previewStatus);
  const setPreviewStatus = useEditorStore((s) => s.setPreviewStatus);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const isLoopingTrim = useEditorStore((s) => s.isLoopingTrim);
  const setIsLoopingTrim = useEditorStore((s) => s.setIsLoopingTrim);
  const playbackSpeed = useEditorStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useEditorStore((s) => s.setPlaybackSpeed);
  const volume = useEditorStore((s) => s.volume);
  const setVolume = useEditorStore((s) => s.setVolume);

  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isRetryingPreview, setIsRetryingPreview] = React.useState(false);

  const offsetSec = previewStatus?.offset_sec ?? Math.max(0, (clip?.source_start_sec ?? 0) - 5);
  const trimStart = clip?.edit_state?.trim?.start ?? clip?.source_start_sec ?? 0;
  const trimEnd = clip?.edit_state?.trim?.end ?? clip?.source_end_sec ?? 30;

  // Auto-prepare preview if missing
  React.useEffect(() => {
    if (clip && (!previewStatus || previewStatus.status === "missing")) {
      apiClient.preparePreview(clip.id).then((status) => {
        setPreviewStatus(status);
      }).catch(() => {});
    }
  }, [clip, previewStatus, setPreviewStatus]);

  // Sync isPlaying with video element
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }, [isPlaying, setIsPlaying]);

  // Sync playback speed
  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Sync volume
  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  // Sync external seek (when user clicks timeline or inputs)
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const targetPreviewTime = sourceToPreviewTime(currentTime, offsetSec);
    if (Math.abs(video.currentTime - targetPreviewTime) > 0.15) {
      video.currentTime = targetPreviewTime;
    }
  }, [currentTime, offsetSec]);

  // Video time update event handler
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const sourceTime = previewToSourceTime(video.currentTime, offsetSec);
    setCurrentTime(sourceTime);

    // Loop mode check
    if (isLoopingTrim) {
      if (sourceTime >= trimEnd || sourceTime < trimStart) {
        const loopStartPreviewTime = sourceToPreviewTime(trimStart, offsetSec);
        video.currentTime = loopStartPreviewTime;
        setCurrentTime(trimStart);
      }
    }
  };

  const handleRetryPreview = async () => {
    if (!clip) return;
    setIsRetryingPreview(true);
    try {
      const res = await apiClient.preparePreview(clip.id);
      setPreviewStatus(res);
    } catch {
    } finally {
      setIsRetryingPreview(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Video URL
  const videoUrl = clip ? apiClient.getPreviewVideoUrl(clip.id) : "";

  // 1. Preview Preparing State
  if (previewStatus?.status === "preparing") {
    return (
      <div className="w-full aspect-video bg-surface border border-border rounded-2xl flex flex-col items-center justify-center gap-4 p-8 text-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <div className="space-y-1">
          <h4 className="text-base font-bold text-text-primary">Preparing preview...</h4>
          <p className="text-xs text-text-secondary">
            Transcoding padded video clip and generating audio waveforms.
          </p>
        </div>
        <div className="w-64 bg-background border border-border h-2 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${previewStatus.progress || 35}%` }}
          />
        </div>
        <span className="text-xs font-mono text-text-secondary">{previewStatus.progress || 35}%</span>
      </div>
    );
  }

  // 2. Preview Failed State
  if (previewStatus?.status === "failed") {
    return (
      <div className="w-full aspect-video bg-surface border border-error/30 rounded-2xl flex flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-error" />
        <div className="space-y-1">
          <h4 className="text-base font-bold text-text-primary">Preview generation failed</h4>
          <p className="text-xs text-error/90 max-w-sm">
            {previewStatus.error_message || "Could not transcode source stream. The source media may be temporarily unavailable."}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          isLoading={isRetryingPreview}
          onClick={handleRetryPreview}
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Retry Preview
        </Button>
      </div>
    );
  }

  // 3. Ready Video Player
  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-border shadow-2xl flex flex-col group select-none"
    >
      <video
        ref={videoRef}
        src={videoUrl}
        preload="metadata"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={() => setIsPlaying(!isPlaying)}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Floating Center Play/Pause indicator on click */}
      {!isPlaying && (
        <div
          onClick={() => setIsPlaying(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-primary/90 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm pl-1">
            <Play className="w-8 h-8 fill-current" />
          </div>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-between gap-4 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {/* Left: Play/Pause, Loop, Time */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current" />
            )}
          </button>

          <button
            onClick={() => setIsLoopingTrim(!isLoopingTrim)}
            className={`p-1.5 rounded-lg transition-colors ${
              isLoopingTrim ? "text-primary bg-primary/20" : "text-white/80 hover:bg-white/20"
            }`}
            title="Loop trimmed section"
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Timecode display */}
          <div className="font-mono text-xs tracking-wider text-white/90">
            <span>{formatTimestamp(currentTime)}</span>
            <span className="text-white/40 mx-1.5">/</span>
            <span className="text-white/60">
              {formatTimestamp(previewStatus?.duration_sec ? offsetSec + previewStatus.duration_sec : trimEnd)}
            </span>
          </div>
        </div>

        {/* Right: Volume, Speed, Fullscreen */}
        <div className="flex items-center gap-3">
          {/* Volume */}
          <div className="flex items-center gap-2 group/vol">
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            >
              {volume === 0 ? (
                <VolumeX className="w-4 h-4 text-white/70" />
              ) : (
                <Volume2 className="w-4 h-4 text-white/90" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 h-1 accent-primary bg-white/30 rounded-lg cursor-pointer"
            />
          </div>

          {/* Playback speed */}
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            className="bg-black/60 border border-white/20 rounded-lg text-xs font-mono px-2 py-1 text-white focus:outline-none cursor-pointer"
          >
            <option value="0.5">0.5x</option>
            <option value="1">1.0x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2.0x</option>
          </select>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-white/90" />
            ) : (
              <Maximize2 className="w-4 h-4 text-white/90" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
