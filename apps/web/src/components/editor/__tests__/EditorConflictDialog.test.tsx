import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorConflictDialog } from "../EditorConflictDialog";
import { useEditorStore } from "@/stores/editor-store";
import type { Clip } from "@/types";

const conflictClip: Clip = {
  id: "test-clip-1",
  project_id: "test-project-1",
  analysis_id: null,
  moment_id: null,
  title: "Server Updated Clip Title",
  category: "custom",
  source_start_sec: 15.0,
  source_end_sec: 35.0,
  edit_state: {
    schema_version: 1,
    trim: { start: 15.0, end: 35.0 },
  },
  status: "ready",
  thumbnail_url: null,
  score: null,
  reason: null,
  version: 2, // Newer version from server
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("EditorConflictDialog (409 Version Conflict)", () => {
  it("does not render when there is no conflict", () => {
    useEditorStore.getState().setConflictClip(null);
    render(<EditorConflictDialog />);
    expect(screen.queryByText(/This clip was changed elsewhere/i)).not.toBeInTheDocument();
  });

  it("renders conflict warning modal when conflictClip is set", () => {
    useEditorStore.getState().setConflictClip(conflictClip);
    render(<EditorConflictDialog />);

    expect(screen.getByText("Conflict Detected")).toBeInTheDocument();
    expect(screen.getByText(/This clip was changed elsewhere/i)).toBeInTheDocument();
    expect(screen.getByText(/Another session or automated process updated this clip to version 2/i)).toBeInTheDocument();
  });

  it("resolves conflict and updates store when Reload button is clicked", () => {
    useEditorStore.getState().setConflictClip(conflictClip);
    render(<EditorConflictDialog />);

    const reloadBtn = screen.getByRole("button", { name: /Reload Latest Version/i });
    fireEvent.click(reloadBtn);

    const state = useEditorStore.getState();
    expect(state.conflictClip).toBeNull();
    expect(state.clip?.version).toBe(2);
    expect(state.clip?.title).toBe("Server Updated Clip Title");
    expect(state.saveStatus).toBe("saved");
  });
});
