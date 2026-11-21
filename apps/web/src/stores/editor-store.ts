import { create } from "zustand";
import type { Clip, EditState, PreviewStatus, Waveform, Thumbnails, Render } from "@/types";
import { clamp } from "@/lib/time-mapping";

const MAX_HISTORY = 50;

interface EditorStoreState {
  clip: Clip | null;
  originalClip: Clip | null;
  history: EditState[];
  historyIndex: number;
  saveStatus: "saved" | "saving" | "unsaved";
  previewStatus: PreviewStatus | null;
  waveform: Waveform | null;
  thumbnails: Thumbnails | null;
  currentTime: number; // Source media time (seconds)
  isPlaying: boolean;
  isLoopingTrim: boolean;
  playbackSpeed: number;
  volume: number;
  zoom: number; // 1 to 5
  snapToSentence: boolean;
  sentenceBoundaries: number[]; // Source timestamps
  conflictClip: Clip | null;
  latestRender: Render | null;

  // Actions
  initClip: (clip: Clip) => void;
  updateTitle: (title: string) => void;
  updateTrim: (start: number, end: number, pushHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  resetToOriginal: () => void;
  setSaveStatus: (status: "saved" | "saving" | "unsaved") => void;
  setPreviewStatus: (preview: PreviewStatus | null) => void;
  setWaveform: (waveform: Waveform | null) => void;
  setThumbnails: (thumbnails: Thumbnails | null) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLoopingTrim: (loop: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setZoom: (zoom: number) => void;
  setSnapToSentence: (snap: boolean) => void;
  setSentenceBoundaries: (boundaries: number[]) => void;
  setConflictClip: (clip: Clip | null) => void;
  resolveConflict: (acceptedClip: Clip) => void;
  setLatestRender: (render: Render | null) => void;
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  clip: null,
  originalClip: null,
  history: [],
  historyIndex: -1,
  saveStatus: "saved",
  previewStatus: null,
  waveform: null,
  thumbnails: null,
  currentTime: 0,
  isPlaying: false,
  isLoopingTrim: false,
  playbackSpeed: 1.0,
  volume: 1.0,
  zoom: 1.0,
  snapToSentence: true,
  sentenceBoundaries: [],
  conflictClip: null,
  latestRender: null,

  initClip: (clip) => {
    if (!clip) return;
    const rawEditState = clip.edit_state || {
      schema_version: 1,
      trim: {
        start: clip.source_start_sec || 0,
        end: clip.source_end_sec || 30,
      },
    };
    const editState = JSON.parse(JSON.stringify(rawEditState));
    const start = editState.trim?.start ?? clip.source_start_sec ?? 0;
    set({
      clip: {
        ...clip,
        edit_state: editState,
      },
      originalClip: {
        ...clip,
        edit_state: editState,
      },
      history: [editState],
      historyIndex: 0,
      saveStatus: "saved",
      currentTime: start,
      conflictClip: null,
    });
  },

  updateTitle: (title) => {
    const { clip } = get();
    if (!clip || clip.title === title) return;
    set({
      clip: { ...clip, title },
      saveStatus: "unsaved",
    });
  },

  updateTrim: (start, end, pushHistory = true) => {
    const { clip, history, historyIndex } = get();
    if (!clip) return;

    // Preserve unknown keys in edit_state
    const newEditState: EditState = {
      ...clip.edit_state,
      schema_version: 1,
      trim: {
        start: Math.max(0, start),
        end: Math.max(start + 0.1, end),
      },
    };

    let newHistory = history;
    let newIndex = historyIndex;

    if (pushHistory) {
      newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newEditState);
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      newIndex = newHistory.length - 1;
    }

    set({
      clip: { ...clip, edit_state: newEditState },
      history: newHistory,
      historyIndex: newIndex,
      saveStatus: "unsaved",
    });
  },

  undo: () => {
    const { clip, history, historyIndex } = get();
    if (!clip || historyIndex <= 0) return;

    const prevIndex = historyIndex - 1;
    const prevEditState = history[prevIndex];

    set({
      clip: { ...clip, edit_state: prevEditState },
      historyIndex: prevIndex,
      saveStatus: "unsaved",
      currentTime: prevEditState.trim.start,
    });
  },

  redo: () => {
    const { clip, history, historyIndex } = get();
    if (!clip || historyIndex >= history.length - 1) return;

    const nextIndex = historyIndex + 1;
    const nextEditState = history[nextIndex];

    set({
      clip: { ...clip, edit_state: nextEditState },
      historyIndex: nextIndex,
      saveStatus: "unsaved",
      currentTime: nextEditState.trim.start,
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  resetToOriginal: () => {
    const { originalClip, clip } = get();
    if (!originalClip || !clip) return;

    const resetState = JSON.parse(JSON.stringify(originalClip.edit_state));
    const { history } = get();
    const newHistory = [...history, resetState];

    set({
      clip: {
        ...clip,
        title: originalClip.title,
        edit_state: resetState,
      },
      history: newHistory,
      historyIndex: newHistory.length - 1,
      saveStatus: "unsaved",
      currentTime: resetState.trim.start,
    });
  },

  setSaveStatus: (status) => set({ saveStatus: status }),
  setPreviewStatus: (preview) => set({ previewStatus: preview }),
  setWaveform: (waveform) => set({ waveform }),
  setThumbnails: (thumbnails) => set({ thumbnails }),
  setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsLoopingTrim: (loop) => set({ isLoopingTrim: loop }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setVolume: (volume) => set({ volume: clamp(volume, 0, 1) }),
  setZoom: (zoom) => set({ zoom: clamp(zoom, 1, 5) }),
  setSnapToSentence: (snap) => set({ snapToSentence: snap }),
  setSentenceBoundaries: (boundaries) => set({ sentenceBoundaries: boundaries }),
  setConflictClip: (clip) => set({ conflictClip: clip }),
  resolveConflict: (acceptedClip) => {
    set({
      clip: JSON.parse(JSON.stringify(acceptedClip)),
      originalClip: JSON.parse(JSON.stringify(acceptedClip)),
      conflictClip: null,
      saveStatus: "saved",
      history: [acceptedClip.edit_state],
      historyIndex: 0,
    });
  },
  setLatestRender: (render) => set({ latestRender: render }),
}));
