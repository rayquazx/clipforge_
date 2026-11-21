"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/stores/editor-store";

export function useEditorShortcuts(onSave?: () => void) {
  const clip = useEditorStore((s) => s.clip);
  const currentTime = useEditorStore((s) => s.currentTime);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const updateTrim = useEditorStore((s) => s.updateTrim);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const trimStart = clip?.edit_state?.trim?.start ?? 0;
  const trimEnd = clip?.edit_state?.trim?.end ?? 30;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // 1. Ctrl+S -> Manual save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave?.();
        return;
      }

      // 2. Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // 3. Space -> Play / Pause
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setIsPlaying(!isPlaying);
        return;
      }

      // 4. I / O -> Set In / Out points to playhead
      if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        if (currentTime < trimEnd - 0.5) {
          updateTrim(currentTime, trimEnd);
        }
        return;
      }
      if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (currentTime > trimStart + 0.5) {
          updateTrim(trimStart, currentTime);
        }
        return;
      }

      // 5. J / K / L -> Shuttle controls
      if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        setCurrentTime(Math.max(0, currentTime - 2.0));
        return;
      }
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsPlaying(false);
        return;
      }
      if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        setCurrentTime(currentTime + 2.0);
        return;
      }

      // 6. Arrow Keys (Frame seek ~0.033s; Shift+Arrow = 1.0s)
      const frameDelta = 1 / 30;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const delta = e.shiftKey ? 1.0 : frameDelta;
        setCurrentTime(Math.max(0, currentTime - delta));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.shiftKey ? 1.0 : frameDelta;
        setCurrentTime(currentTime + delta);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, isPlaying, trimStart, trimEnd, onSave, undo, redo, setIsPlaying, setCurrentTime, updateTrim]);
}
