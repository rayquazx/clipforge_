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
  Tv,
  Sparkles,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { apiClient } from "@/lib/api";
import {
  sourceToPreviewTime,
  previewToSourceTime,
  formatTimestamp,
  clamp,
} from "@/lib/time-mapping";
import { layoutToCSS } from "@/lib/ad-math";
import { Button } from "@/components/ui/Button";
import { EditorPreviewWithAdsModal } from "./EditorPreviewWithAdsModal";

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

  // Phase 6 Ads State
  const playWithAds = useEditorStore((s) => s.playWithAds);
  const setPlayWithAds = useEditorStore((s) => s.setPlayWithAds);
  const selectedAdId = useEditorStore((s) => s.selectedAdId);
  const setSelectedAdId = useEditorStore((s) => s.setSelectedAdId);

  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isRetryingPreview, setIsRetryingPreview] = React.useState(false);
  const [isPreviewWithAdsOpen, setIsPreviewWithAdsOpen] = React.useState(false);

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

      {/* Live Overlay and Lower-Third Ads (in MAIN clip time) */}
      {clip?.edit_state?.ads?.map((ad) => {
        if (ad.type !== "overlay" && ad.type !== "lower_third") return null;

        const mainTime = currentTime - trimStart;
        const start = ad.timing.offset_sec;
        const duration = ad.timing.duration_sec || 5;
        const end = start + duration;
        const isVisible = mainTime >= start && mainTime <= end;

        if (!isVisible) return null;

        const isSelected = selectedAdId === ad.id;
        const css = layoutToCSS(ad.layout);
        const animationClass =
          ad.animation === "fade"
            ? "animate-in fade-in duration-300"
            : ad.animation === "slide"
            ? "animate-in slide-in-from-bottom-3 duration-300"
            : "";

        return (
          <div
            key={ad.id}
            style={css}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAdId(ad.id);
            }}
            className={`pointer-events-auto cursor-pointer transition-all ${animationClass} ${
              isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-black rounded-lg" : ""
            }`}
          >
            {ad.type === "lower_third" ? (
              <div className="bg-black/85 backdrop-blur-md text-white px-3.5 py-1.5 rounded-xl border border-white/20 shadow-2xl flex items-center gap-2.5">
                <div className="w-2 h-6 rounded-full bg-primary shrink-0" />
                <div className="truncate">
                  <div className="text-xs font-bold tracking-wide truncate">
                    {ad.text_override || "Sponsor Title"}
                  </div>
                  <div className="text-[10px] text-white/70">Sponsored Content</div>
                </div>
              </div>
            ) : ad.text_override ? (
              <div className="px-3 py-1.5 rounded-lg bg-black/85 text-white text-xs font-bold shadow-lg border border-white/20">
                {ad.text_override}
              </div>
            ) : (
              <div className="bg-surface/90 backdrop-blur-sm p-2 rounded-xl border border-white/20 shadow-2xl flex items-center gap-2 text-white">
                <div className="w-5 h-5 rounded-md bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                  AD
                </div>
                <span className="text-xs font-semibold">Ad Overlay</span>
              </div>
            )}
          </div>
        );
      })}

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

        {/* Right: Ads toggle, 360p Preview, Volume, Speed, Fullscreen */}
        <div className="flex items-center gap-2.5">
          {/* Play with Ads Toggle */}
          <button
            type="button"
            onClick={() => setPlayWithAds(!playWithAds)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              playWithAds
                ? "bg-amber-400/20 text-amber-300 border-amber-400/50"
                : "text-white/70 border-white/20 hover:bg-white/10"
            }`}
            title="Simulate playback with ads mode"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Ads: {playWithAds ? "ON" : "OFF"}</span>
          </button>

          {/* Quick 360p Preview with Ads */}
          <button
            type="button"
            onClick={() => setIsPreviewWithAdsOpen(true)}
            className="px-2 py-1 rounded-lg text-xs font-semibold text-white/80 border border-white/20 hover:bg-white/10 transition-colors flex items-center gap-1.5"
            title="Quick 360p Preview with ads baked in"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>360p Preview</span>
          </button>

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

      {/* 360p Preview with Ads Modal */}
      {clip && (
        <EditorPreviewWithAdsModal
          isOpen={isPreviewWithAdsOpen}
          onClose={() => setIsPreviewWithAdsOpen(false)}
          clipId={clip.id}
        />
      )}
    </div>
  );
}
