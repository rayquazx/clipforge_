import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor-store";
import type { Clip } from "@/types";

const mockClip: Clip = {
  id: "test-clip-1",
  project_id: "test-project-1",
  analysis_id: "test-analysis-1",
  moment_id: "test-moment-1",
  title: "Test Viral Highlight",
  category: "funny",
  source_start_sec: 10.0,
  source_end_sec: 25.0,
  edit_state: {
    schema_version: 1,
    trim: { start: 10.0, end: 25.0 },
    custom_field_to_preserve: "important_data",
  },
  status: "ready",
  thumbnail_url: null,
  score: 0.95,
  reason: "High laughter peak",
  version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("Editor Store (Undo/Redo & State Management)", () => {
  beforeEach(() => {
    useEditorStore.getState().initClip(mockClip);
  });

  it("initializes clip state and history correctly", () => {
    const state = useEditorStore.getState();
    expect(state.clip?.id).toBe("test-clip-1");
    expect(state.history.length).toBe(1);
    expect(state.historyIndex).toBe(0);
    expect(state.saveStatus).toBe("saved");
  });

  it("updates trim boundaries and pushes to undo history", () => {
    useEditorStore.getState().updateTrim(12.0, 28.0, true);
    const state = useEditorStore.getState();

    expect(state.clip?.edit_state.trim.start).toBe(12.0);
    expect(state.clip?.edit_state.trim.end).toBe(28.0);
    expect(state.history.length).toBe(2);
    expect(state.historyIndex).toBe(1);
    expect(state.saveStatus).toBe("unsaved");
  });

  it("preserves unknown edit_state keys per contract rules", () => {
    useEditorStore.getState().updateTrim(14.0, 30.0, true);
    const state = useEditorStore.getState();

    expect(state.clip?.edit_state.custom_field_to_preserve).toBe("important_data");
  });

  it("supports undo and redo", () => {
    // 1st change
    useEditorStore.getState().updateTrim(12.0, 28.0, true);
    // 2nd change
    useEditorStore.getState().updateTrim(15.0, 32.0, true);

    expect(useEditorStore.getState().historyIndex).toBe(2);
    expect(useEditorStore.getState().clip?.edit_state.trim.start).toBe(15.0);

    // Undo 2nd change
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().historyIndex).toBe(1);
    expect(useEditorStore.getState().clip?.edit_state.trim.start).toBe(12.0);

    // Undo 1st change
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().historyIndex).toBe(0);
    expect(useEditorStore.getState().clip?.edit_state.trim.start).toBe(10.0);

    // Redo 1st change
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().historyIndex).toBe(1);
    expect(useEditorStore.getState().clip?.edit_state.trim.start).toBe(12.0);
  });

  it("resets clip state to original detection", () => {
    useEditorStore.getState().updateTrim(20.0, 40.0, true);
    useEditorStore.getState().updateTitle("Changed Title");

    useEditorStore.getState().resetToOriginal();
    const state = useEditorStore.getState();

    expect(state.clip?.title).toBe("Test Viral Highlight");
    expect(state.clip?.edit_state.trim.start).toBe(10.0);
    expect(state.clip?.edit_state.trim.end).toBe(25.0);
  });
});
