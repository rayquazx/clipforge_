import * as React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditorTrimControls } from "../EditorTrimControls";
import { useEditorStore } from "@/stores/editor-store";
import type { Clip } from "@/types";

const mockClip: Clip = {
  id: "test-clip-1",
  project_id: "test-project-1",
  analysis_id: null,
  moment_id: null,
  title: "Test Clip",
  category: "custom",
  source_start_sec: 10.0,
  source_end_sec: 30.0,
  edit_state: {
    schema_version: 1,
    trim: { start: 10.0, end: 30.0 },
  },
  status: "ready",
  thumbnail_url: null,
  score: null,
  reason: null,
  version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("EditorTrimControls Component", () => {
  beforeEach(() => {
    useEditorStore.getState().initClip(mockClip);
  });

  it("renders duration badge and trim input fields", () => {
    renderWithClient(<EditorTrimControls />);
    expect(screen.getByText(/Duration:/i)).toBeInTheDocument();
    expect(screen.getByText("20.00s")).toBeInTheDocument();
    expect(screen.getByDisplayValue("00:00:10.000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("00:00:30.000")).toBeInTheDocument();
  });

  it("updates start boundary on input change and blur", () => {
    renderWithClient(<EditorTrimControls />);
    const startInput = screen.getByDisplayValue("00:00:10.000");

    fireEvent.change(startInput, { target: { value: "00:00:15.000" } });
    fireEvent.blur(startInput);

    expect(useEditorStore.getState().clip?.edit_state.trim.start).toBe(15.0);
  });

  it("nudges start boundary when clicking nudge buttons", () => {
    renderWithClient(<EditorTrimControls />);
    const plusOneSecBtn = screen.getAllByRole("button", { name: "+1s" })[0];

    fireEvent.click(plusOneSecBtn);
    expect(useEditorStore.getState().clip?.edit_state.trim.start).toBe(11.0);
  });

  it("sets start point to current playhead on 'Set to Playhead (I)' click", () => {
    useEditorStore.getState().setCurrentTime(14.5);
    renderWithClient(<EditorTrimControls />);

    const setStartBtn = screen.getByRole("button", { name: /Set to Playhead \(I\)/i });
    fireEvent.click(setStartBtn);

    expect(useEditorStore.getState().clip?.edit_state.trim.start).toBe(14.5);
  });
});
