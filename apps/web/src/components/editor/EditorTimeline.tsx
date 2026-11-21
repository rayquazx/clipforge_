"use client";

import * as React from "react";
import {
  ZoomIn,
  ZoomOut,
  Magnet,
  SlidersHorizontal,
  Tv,
  Layers,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { clamp, snapToPoints, formatTimestamp } from "@/lib/time-mapping";
import { calculateTimeline, formatTimelineSummary, formatSeconds } from "@/lib/ad-math";

export function EditorTimeline() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const adsTrackRef = React.useRef<HTMLDivElement | null>(null);

  const clip = useEditorStore((s) => s.clip);
  const previewStatus = useEditorStore((s) => s.previewStatus);
  const waveform = useEditorStore((s) => s.waveform);
  const thumbnails = useEditorStore((s) => s.thumbnails);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const updateTrim = useEditorStore((s) => s.updateTrim);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const snapToSentence = useEditorStore((s) => s.snapToSentence);
  const setSnapToSentence = useEditorStore((s) => s.setSnapToSentence);
  const sentenceBoundaries = useEditorStore((s) => s.sentenceBoundaries);

  // Phase 6 Ads Store actions
  const selectedAdId = useEditorStore((s) => s.selectedAdId);
  const setSelectedAdId = useEditorStore((s) => s.setSelectedAdId);
  const updateAdPlacement = useEditorStore((s) => s.updateAdPlacement);
  const removeAdPlacement = useEditorStore((s) => s.removeAdPlacement);

  const offsetSec = previewStatus?.offset_sec ?? Math.max(0, (clip?.source_start_sec ?? 0) - 5);
  const durationSec = previewStatus?.duration_sec ?? Math.max(10, (clip?.source_end_sec ?? 30) - offsetSec + 10);
  const timelineStart = offsetSec;
  const timelineEnd = offsetSec + durationSec;

  const trimStart = clip?.edit_state?.trim?.start ?? clip?.source_start_sec ?? timelineStart;
  const trimEnd = clip?.edit_state?.trim?.end ?? clip?.source_end_sec ?? (timelineStart + 20);
  const mainDuration = Math.max(0.1, trimEnd - trimStart);

  // Phase 6 Ads and Summary
  const ads = clip?.edit_state?.ads || [];
  const prerollAds = ads.filter((a) => a.type === "preroll");
  const postrollAds = ads.filter((a) => a.type === "postroll");
  const overlayAds = ads.filter((a) => a.type === "overlay" || a.type === "lower_third");

  const timelineInfo = calculateTimeline(mainDuration, ads);
  const summaryText = formatTimelineSummary(timelineInfo);

  // Dragging interaction state
  const [activeDrag, setActiveDrag] = React.useState<"start" | "end" | "playhead" | "ad_move" | null>(null);
  const [dragAdId, setDragAdId] = React.useState<string | null>(null);

  // Calculate percentage along timeline
  const getPercent = (time: number) => {
    return clamp(((time - timelineStart) / durationSec) * 100, 0, 100);
  };

  // Convert clientX to source time
  const getTimeFromClientX = (clientX: number): number => {
    if (!trackRef.current) return timelineStart;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const rawTime = timelineStart + ratio * durationSec;

    // Snapping candidates: playhead + sentence boundaries
    if (snapToSentence) {
      const snapPoints = [currentTime, ...sentenceBoundaries];
      return snapToPoints(rawTime, snapPoints, 0.4);
    }
    return rawTime;
  };

  // Keyboard navigation for selected ad placement
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedAdId) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }

      const activePlacement = ads.find((a) => a.id === selectedAdId);
      if (!activePlacement) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newOffset = Math.max(0, activePlacement.timing.offset_sec - 0.5);
        updateAdPlacement(selectedAdId, {
          timing: { ...activePlacement.timing, offset_sec: Number(newOffset.toFixed(2)) },
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const maxOffset = Math.max(0, mainDuration - (activePlacement.timing.duration_sec || 1));
        const newOffset = Math.min(maxOffset, activePlacement.timing.offset_sec + 0.5);
        updateAdPlacement(selectedAdId, {
          timing: { ...activePlacement.timing, offset_sec: Number(newOffset.toFixed(2)) },
        });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeAdPlacement(selectedAdId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAdId, ads, mainDuration, updateAdPlacement, removeAdPlacement]);

  // Pointer drag listeners for Trim handles and Playhead
  React.useEffect(() => {
    if (!activeDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      const time = getTimeFromClientX(e.clientX);
      if (activeDrag === "playhead") {
        setCurrentTime(time);
      } else if (activeDrag === "start") {
        const newStart = Math.min(time, trimEnd - 1.0);
        updateTrim(Math.max(timelineStart, newStart), trimEnd, false);
      } else if (activeDrag === "end") {
        const newEnd = Math.max(time, trimStart + 1.0);
        updateTrim(trimStart, Math.min(timelineEnd, newEnd), false);
      }
    };

    const handlePointerUp = () => {
      if (activeDrag === "start" || activeDrag === "end") {
        updateTrim(trimStart, trimEnd, true);
      }
      setActiveDrag(null);
      setDragAdId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeDrag, trimStart, trimEnd, timelineStart, timelineEnd, durationSec, snapToSentence, sentenceBoundaries, currentTime, updateTrim, setCurrentTime]);

  // Click on track to seek
  const handleTrackClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-handle]") || (e.target as HTMLElement).closest("[data-ad-block]")) {
      return;
    }
    const time = getTimeFromClientX(e.clientX);
    setCurrentTime(time);
  };

  // Render thumbnail frames along strip
  const renderThumbnails = () => {
    if (!thumbnails) return null;
    const count = thumbnails.count || 10;
    const frameWidth = thumbnails.frame_width || 160;
    const frameHeight = thumbnails.frame_height || 90;
    const cols = thumbnails.columns || 10;

    const frames = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bgX = -col * frameWidth;
      const bgY = -row * frameHeight;

      frames.push(
        <div
          key={i}
          className="flex-1 h-full border-r border-border/40 shrink-0 opacity-80"
          style={{
            backgroundImage: `url(${thumbnails.sprite_url})`,
            backgroundPosition: `${bgX}px ${bgY}px`,
            backgroundSize: `${cols * 100}% auto`,
          }}
        />
      );
    }
    return <div className="absolute inset-0 flex overflow-hidden pointer-events-none">{frames}</div>;
  };

  // Render waveform peaks canvas
  const renderWaveform = () => {
    if (!waveform || !waveform.peaks || waveform.peaks.length === 0) return null;
    const peaks = waveform.peaks;

    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-90"
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
      >
        <path
          d={peaks
            .map((p, idx) => {
              const x = (idx / (peaks.length - 1)) * 1000;
              const h = p * 40;
              return `M ${x.toFixed(1)} 50 L ${x.toFixed(1)} ${(50 - h).toFixed(1)} M ${x.toFixed(1)} 50 L ${x.toFixed(1)} ${(50 + h).toFixed(1)}`;
            })
            .join(" ")}
          stroke="#9146FF"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  const startPercent = getPercent(trimStart);
  const endPercent = getPercent(trimEnd);
  const playheadPercent = getPercent(currentTime);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3 select-none">
      {/* Top Toolbar: Total Duration Indicator, Snapping & Zoom controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-text-primary uppercase tracking-wider text-[11px]">
            Timeline
          </span>

          {/* Phase 6 Total Duration Math Summary Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background border border-border text-[11px] font-mono text-text-primary shadow-sm">
            <Tv className="w-3.5 h-3.5 text-primary" />
            <span>{summaryText}</span>
          </div>

          <button
            type="button"
            onClick={() => setSnapToSentence(!snapToSentence)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
              snapToSentence
                ? "bg-primary/10 border-primary/40 text-primary font-medium"
                : "border-border hover:bg-surface-hover text-text-secondary"
            }`}
            title="Snap trim handles to sentence boundaries and playhead"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Snapping {snapToSentence ? "On" : "Off"}</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            disabled={zoom <= 1}
            className="p-1 rounded hover:bg-surface-hover disabled:opacity-40"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] w-8 text-center">{zoom.toFixed(1)}x</span>
          <button
            type="button"
            onClick={() => setZoom(Math.min(5, zoom + 0.5))}
            disabled={zoom >= 5}
            className="p-1 rounded hover:bg-surface-hover disabled:opacity-40"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Timeline Container */}
      <div ref={containerRef} className="overflow-x-auto overflow-y-hidden pb-2 scrollbar-thin space-y-2">
        {/* Track 1: Main Video Strip & Waveform */}
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          style={{ width: `${zoom * 100}%` }}
          className="relative h-28 bg-background/90 rounded-xl border border-border/80 cursor-pointer overflow-hidden transition-all duration-75"
        >
          {/* 1. Thumbnail Strip */}
          {renderThumbnails()}

          {/* 2. Waveform */}
          {renderWaveform()}

          {/* 3. Visual Pre-Roll Block (Amber) before trimStart */}
          {prerollAds.length > 0 && (
            <div
              className="absolute top-0 bottom-0 left-0 bg-amber-500/20 border-r-2 border-amber-400 z-10 flex items-center justify-center pointer-events-none px-2"
              style={{ width: `${Math.min(startPercent, 15)}%` }}
            >
              <span className="text-[10px] font-bold text-amber-300 font-mono truncate">
                Pre-roll ({formatSeconds(timelineInfo.preroll_duration_sec)})
              </span>
            </div>
          )}

          {/* 4. Visual Post-Roll Block (Emerald) after trimEnd */}
          {postrollAds.length > 0 && (
            <div
              className="absolute top-0 bottom-0 right-0 bg-emerald-500/20 border-l-2 border-emerald-400 z-10 flex items-center justify-center pointer-events-none px-2"
              style={{ width: `${Math.min(100 - endPercent, 15)}%` }}
            >
              <span className="text-[10px] font-bold text-emerald-300 font-mono truncate">
                Post-roll ({formatSeconds(timelineInfo.postroll_duration_sec)})
              </span>
            </div>
          )}

          {/* 5. Dimmed outside regions */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-black/75 backdrop-blur-[1px] pointer-events-none transition-[width] duration-75"
            style={{ width: `${startPercent}%` }}
          />
          <div
            className="absolute top-0 bottom-0 right-0 bg-black/75 backdrop-blur-[1px] pointer-events-none transition-[width] duration-75"
            style={{ width: `${100 - endPercent}%` }}
          />

          {/* 6. Active Trim Selection Highlight border */}
          <div
            className="absolute top-0 bottom-0 border-y-2 border-primary pointer-events-none"
            style={{
              left: `${startPercent}%`,
              width: `${endPercent - startPercent}%`,
            }}
          />

          {/* 7. Left Handle (Trim Start) */}
          <div
            data-handle="start"
            role="slider"
            tabIndex={0}
            aria-label="Trim Start"
            aria-valuenow={trimStart}
            aria-valuemin={timelineStart}
            aria-valuemax={trimEnd - 1}
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveDrag("start");
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") updateTrim(trimStart - 0.1, trimEnd);
              if (e.key === "ArrowRight") updateTrim(Math.min(trimEnd - 1, trimStart + 0.1), trimEnd);
            }}
            className="absolute top-0 bottom-0 w-4 -ml-2 z-20 cursor-ew-resize flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary rounded"
            style={{ left: `${startPercent}%` }}
          >
            <div className="w-2.5 h-full bg-primary rounded-l-md shadow-lg flex flex-col items-center justify-center gap-1 group-hover:scale-105">
              <div className="w-0.5 h-3 bg-white/70 rounded-full" />
              <div className="w-0.5 h-3 bg-white/70 rounded-full" />
            </div>
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/90 text-[10px] font-mono text-white whitespace-nowrap pointer-events-none shadow">
              {formatTimestamp(trimStart)}
            </div>
          </div>

          {/* 8. Right Handle (Trim End) */}
          <div
            data-handle="end"
            role="slider"
            tabIndex={0}
            aria-label="Trim End"
            aria-valuenow={trimEnd}
            aria-valuemin={trimStart + 1}
            aria-valuemax={timelineEnd}
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveDrag("end");
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") updateTrim(trimStart, Math.max(trimStart + 1, trimEnd - 0.1));
              if (e.key === "ArrowRight") updateTrim(trimStart, trimEnd + 0.1);
            }}
            className="absolute top-0 bottom-0 w-4 -ml-2 z-20 cursor-ew-resize flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary rounded"
            style={{ left: `${endPercent}%` }}
          >
            <div className="w-2.5 h-full bg-primary rounded-r-md shadow-lg flex flex-col items-center justify-center gap-1 group-hover:scale-105">
              <div className="w-0.5 h-3 bg-white/70 rounded-full" />
              <div className="w-0.5 h-3 bg-white/70 rounded-full" />
            </div>
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/90 text-[10px] font-mono text-white whitespace-nowrap pointer-events-none shadow">
              {formatTimestamp(trimEnd)}
            </div>
          </div>

          {/* 9. Playhead */}
          <div
            data-handle="playhead"
            role="slider"
            tabIndex={0}
            aria-label="Playhead position"
            aria-valuenow={currentTime}
            aria-valuemin={timelineStart}
            aria-valuemax={timelineEnd}
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveDrag("playhead");
            }}
            className="absolute top-0 bottom-0 w-1 -ml-0.5 z-30 bg-amber-400 cursor-ew-resize shadow-md"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="w-3.5 h-3.5 bg-amber-400 rotate-45 -ml-1.5 -mt-1.5 rounded-sm shadow-md" />
          </div>
        </div>

        {/* Track 2: Dedicated Ads Track (Overlay & Lower-Third blocks in MAIN clip time) */}
        <div
          ref={adsTrackRef}
          style={{ width: `${zoom * 100}%` }}
          className="relative h-10 bg-surface/80 rounded-xl border border-border/80 overflow-hidden flex items-center px-2 select-none"
        >
          <div className="absolute left-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1 z-0 pointer-events-none">
            <Layers className="w-3 h-3 text-primary" />
            <span>Ads Track</span>
          </div>

          {/* The trimmed active region bounds matching the main track */}
          <div
            className="absolute top-0 bottom-0 bg-primary/5 border-x border-primary/20 pointer-events-none"
            style={{
              left: `${startPercent}%`,
              width: `${endPercent - startPercent}%`,
            }}
          />

          {/* Render individual overlay / lower-third ad blocks mapped to MAIN clip time */}
          {overlayAds.map((ad) => {
            const startRatio = clamp(ad.timing.offset_sec / mainDuration, 0, 1);
            const durationRatio = clamp((ad.timing.duration_sec || 5) / mainDuration, 0.05, 1);

            // Calculate absolute position on the timeline track
            const clipWidthPercent = endPercent - startPercent;
            const leftOffsetPercent = startPercent + startRatio * clipWidthPercent;
            const widthPercent = Math.min(durationRatio * clipWidthPercent, endPercent - leftOffsetPercent);

            const isSelected = selectedAdId === ad.id;

            return (
              <div
                key={ad.id}
                data-ad-block={ad.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAdId(ad.id);
                }}
                className={`absolute top-1 bottom-1 rounded-lg px-2 flex items-center justify-between text-[10px] font-mono font-bold cursor-pointer transition-all z-10 shadow-sm ${
                  isSelected
                    ? "bg-primary text-white border-2 border-white shadow-md ring-2 ring-primary"
                    : ad.type === "lower_third"
                    ? "bg-[#06b6d4]/20 border border-[#06b6d4]/50 text-[#67e8f9] hover:bg-[#06b6d4]/30"
                    : "bg-primary/20 border border-primary/50 text-text-primary hover:bg-primary/30"
                }`}
                style={{
                  left: `${leftOffsetPercent}%`,
                  width: `${widthPercent}%`,
                }}
                title={`${ad.type === "lower_third" ? "Lower Third" : "Overlay"}: ${ad.text_override || "Asset"} (${formatSeconds(ad.timing.offset_sec)} - ${formatSeconds(ad.timing.offset_sec + (ad.timing.duration_sec || 5))}) • Press Arrow keys to nudge, Delete to remove`}
              >
                <span className="truncate">
                  {ad.type === "lower_third" ? "LowerThird" : "Overlay"} • {formatSeconds(ad.timing.duration_sec || 5)}
                </span>
                {isSelected && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAdPlacement(ad.id);
                    }}
                    className="p-0.5 rounded hover:bg-red-500/30 text-red-200"
                    title="Remove placement"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
