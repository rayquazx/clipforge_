"use client";

import * as React from "react";
import {
  Clock,
  RotateCcw,
  Undo2,
  Redo2,
  Play,
  Repeat,
  AlertCircle,
  Check,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEditorStore } from "@/stores/editor-store";
import { apiClient } from "@/lib/api";
import { formatTimestamp, parseTimestamp } from "@/lib/time-mapping";
import { Button } from "@/components/ui/Button";

export function EditorTrimControls() {
  const clip = useEditorStore((s) => s.clip);
  const currentTime = useEditorStore((s) => s.currentTime);
  const updateTrim = useEditorStore((s) => s.updateTrim);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.canUndo());
  const canRedo = useEditorStore((s) => s.canRedo());
  const resetToOriginal = useEditorStore((s) => s.resetToOriginal);
  const isLoopingTrim = useEditorStore((s) => s.isLoopingTrim);
  const setIsLoopingTrim = useEditorStore((s) => s.setIsLoopingTrim);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);

  const trimStart = clip?.edit_state?.trim?.start ?? clip?.source_start_sec ?? 0;
  const trimEnd = clip?.edit_state?.trim?.end ?? clip?.source_end_sec ?? 30;
  const duration = Math.max(0, trimEnd - trimStart);

  // Local text input states
  const [startInput, setStartInput] = React.useState(formatTimestamp(trimStart));
  const [endInput, setEndInput] = React.useState(formatTimestamp(trimEnd));

  // Sync inputs when trim changes externally (e.g. dragging handle)
  React.useEffect(() => {
    setStartInput(formatTimestamp(trimStart));
  }, [trimStart]);

  React.useEffect(() => {
    setEndInput(formatTimestamp(trimEnd));
  }, [trimEnd]);

  // Fetch /config for max_clip_seconds
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => apiClient.getConfig(),
  });

  const maxClipSeconds = config?.max_clip_seconds || 60;
  const isDurationValid = duration >= 1.0 && duration <= maxClipSeconds;

  // Handle typing commit on blur / Enter
  const handleCommitStart = () => {
    const parsed = parseTimestamp(startInput);
    if (parsed !== null && parsed >= 0 && parsed < trimEnd - 0.5) {
      updateTrim(parsed, trimEnd);
    } else {
      setStartInput(formatTimestamp(trimStart));
    }
  };

  const handleCommitEnd = () => {
    const parsed = parseTimestamp(endInput);
    if (parsed !== null && parsed > trimStart + 0.5) {
      updateTrim(trimStart, parsed);
    } else {
      setEndInput(formatTimestamp(trimEnd));
    }
  };

  // Nudge helpers
  const nudgeStart = (delta: number) => {
    const newStart = Math.max(0, trimStart + delta);
    if (newStart < trimEnd - 0.5) {
      updateTrim(newStart, trimEnd);
    }
  };

  const nudgeEnd = (delta: number) => {
    const newEnd = trimEnd + delta;
    if (newEnd > trimStart + 0.5) {
      updateTrim(trimStart, newEnd);
    }
  };

  // Set to playhead
  const setStartToPlayhead = () => {
    if (currentTime < trimEnd - 0.5) {
      updateTrim(currentTime, trimEnd);
    }
  };

  const setEndToPlayhead = () => {
    if (currentTime > trimStart + 0.5) {
      updateTrim(trimStart, currentTime);
    }
  };

  // Play trimmed section
  const handlePlayTrimmedSection = () => {
    setCurrentTime(trimStart);
    setIsPlaying(true);
    setIsLoopingTrim(true);
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      {/* Top row: Duration & Limits warning, Undo / Redo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background border border-border">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs text-text-secondary font-medium">Duration:</span>
            <span
              className={`font-mono font-bold text-sm ${
                isDurationValid ? "text-emerald-400" : "text-error"
              }`}
            >
              {duration.toFixed(2)}s
            </span>
            <span className="text-[11px] text-text-secondary/60">
              (Min: 1s &bull; Max: {maxClipSeconds}s)
            </span>
          </div>

          {!isDurationValid && (
            <div className="flex items-center gap-1.5 text-xs text-error font-medium animate-pulse">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {duration < 1.0 ? "Clip too short (min 1s)" : `Clip exceeds max ${maxClipSeconds}s`}
              </span>
            </div>
          )}
        </div>

        {/* Undo / Redo / Reset */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!canUndo}
            onClick={undo}
            className="h-8 px-2 text-xs gap-1"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            disabled={!canRedo}
            onClick={redo}
            className="h-8 px-2 text-xs gap-1"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span>Redo</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={resetToOriginal}
            className="h-8 px-2 text-xs gap-1 text-text-secondary hover:text-text-primary"
            title="Reset clip boundaries to original detection"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </Button>
        </div>
      </div>

      {/* Main Trim Inputs & Nudge Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Start Point Controls */}
        <div className="p-4 rounded-xl bg-background/60 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wide">
              Start Boundary (In)
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={setStartToPlayhead}
              className="h-7 text-[11px] px-2 font-mono font-medium"
              title="Set start boundary to current playhead position (I)"
            >
              Set to Playhead (I)
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              onBlur={handleCommitStart}
              onKeyDown={(e) => e.key === "Enter" && handleCommitStart()}
              className="flex-1 h-9 px-3 bg-surface border border-border rounded-lg text-sm font-mono text-text-primary focus:outline-none focus:border-primary"
            />
          </div>

          {/* Nudge Buttons */}
          <div className="flex items-center justify-between gap-1 pt-1">
            <span className="text-[10px] text-text-secondary uppercase">Nudge:</span>
            <div className="flex items-center gap-1 font-mono text-xs">
              <button
                onClick={() => nudgeStart(-1.0)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border text-[11px]"
              >
                -1s
              </button>
              <button
                onClick={() => nudgeStart(-0.1)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border text-[11px]"
              >
                -0.1s
              </button>
              <button
                onClick={() => nudgeStart(0.1)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border text-[11px]"
              >
                +0.1s
              </button>
              <button
                onClick={() => nudgeStart(1.0)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border text-[11px]"
              >
                +1s
              </button>
            </div>
          </div>
        </div>

        {/* End Point Controls */}
        <div className="p-4 rounded-xl bg-background/60 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wide">
              End Boundary (Out)
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={setEndToPlayhead}
              className="h-7 text-[11px] px-2 font-mono font-medium"
              title="Set end boundary to current playhead position (O)"
            >
              Set to Playhead (O)
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              onBlur={handleCommitEnd}
              onKeyDown={(e) => e.key === "Enter" && handleCommitEnd()}
              className="flex-1 h-9 px-3 bg-surface border border-border rounded-lg text-sm font-mono text-text-primary focus:outline-none focus:border-primary"
            />
          </div>

          {/* Nudge Buttons */}
          <div className="flex items-center justify-between gap-1 pt-1">
            <span className="text-[10px] text-text-secondary uppercase">Nudge:</span>
            <div className="flex items-center gap-1 font-mono text-xs">
              <button
                onClick={() => nudgeEnd(-1.0)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border text-[11px]"
              >
                -1s
              </button>
              <button
                onClick={() => nudgeEnd(-0.1)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border text-[11px]"
              >
                -0.1s
              </button>
              <button
                onClick={() => nudgeEnd(0.1)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border text-[11px]"
              >
                +0.1s
              </button>
              <button
                onClick={() => nudgeEnd(1.0)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-border text-[11px]"
              >
                +1s
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Play Trimmed Section Button */}
      <div className="flex items-center justify-between pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handlePlayTrimmedSection}
          className="gap-2 text-xs"
        >
          <Play className="w-3.5 h-3.5 fill-current text-primary" />
          <span>Play Trimmed Section</span>
        </Button>

        <button
          onClick={() => setIsLoopingTrim(!isLoopingTrim)}
          className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
            isLoopingTrim
              ? "bg-primary/10 border-primary/40 text-primary font-medium"
              : "border-border text-text-secondary hover:bg-surface-hover"
          }`}
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>Loop Mode {isLoopingTrim ? "Active" : "Off"}</span>
        </button>
      </div>
    </div>
  );
}
