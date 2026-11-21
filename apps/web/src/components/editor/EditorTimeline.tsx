"use client";

import * as React from "react";
import { ZoomIn, ZoomOut, Magnet, SlidersHorizontal } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { clamp, snapToPoints, formatTimestamp } from "@/lib/time-mapping";

export function EditorTimeline() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);

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

  const offsetSec = previewStatus?.offset_sec ?? Math.max(0, (clip?.source_start_sec ?? 0) - 5);
  const durationSec = previewStatus?.duration_sec ?? Math.max(10, (clip?.source_end_sec ?? 30) - offsetSec + 10);
  const timelineStart = offsetSec;
  const timelineEnd = offsetSec + durationSec;

  const trimStart = clip?.edit_state?.trim?.start ?? clip?.source_start_sec ?? timelineStart;
  const trimEnd = clip?.edit_state?.trim?.end ?? clip?.source_end_sec ?? (timelineStart + 20);

  // Dragging interaction state
  const [activeDrag, setActiveDrag] = React.useState<"start" | "end" | "playhead" | null>(null);

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

  // Pointer drag listeners
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
        // Commit final state to undo/redo history
        updateTrim(trimStart, trimEnd, true);
      }
      setActiveDrag(null);
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
    if ((e.target as HTMLElement).closest("[data-handle]")) return;
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
              const h = p * 40; // peak height
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
      {/* Top Toolbar: Snapping & Zoom controls */}
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-text-primary uppercase tracking-wider text-[11px]">
            Timeline
          </span>

          <button
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
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            disabled={zoom <= 1}
            className="p-1 rounded hover:bg-surface-hover disabled:opacity-40"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] w-8 text-center">{zoom.toFixed(1)}x</span>
          <button
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
      <div ref={containerRef} className="overflow-x-auto overflow-y-hidden pb-2 scrollbar-thin">
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

          {/* 3. Dimmed outside regions */}
          {/* Dimmed Left (before trim start) */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-black/75 backdrop-blur-[1px] pointer-events-none transition-[width] duration-75"
            style={{ width: `${startPercent}%` }}
          />
          {/* Dimmed Right (after trim end) */}
          <div
            className="absolute top-0 bottom-0 right-0 bg-black/75 backdrop-blur-[1px] pointer-events-none transition-[width] duration-75"
            style={{ width: `${100 - endPercent}%` }}
          />

          {/* 4. Active Trim Selection Highlight border */}
          <div
            className="absolute top-0 bottom-0 border-y-2 border-primary pointer-events-none"
            style={{
              left: `${startPercent}%`,
              width: `${endPercent - startPercent}%`,
            }}
          />

          {/* 5. Left Handle (Trim Start) */}
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
            {/* Tooltip on hover/active */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/90 text-[10px] font-mono text-white whitespace-nowrap pointer-events-none shadow">
              {formatTimestamp(trimStart)}
            </div>
          </div>

          {/* 6. Right Handle (Trim End) */}
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
            {/* Tooltip on hover/active */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/90 text-[10px] font-mono text-white whitespace-nowrap pointer-events-none shadow">
              {formatTimestamp(trimEnd)}
            </div>
          </div>

          {/* 7. Playhead */}
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
            {/* Playhead Top Knob */}
            <div className="w-3.5 h-3.5 bg-amber-400 rotate-45 -ml-1.5 -mt-1.5 rounded-sm shadow-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
