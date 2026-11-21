import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditorExportDialog } from "../EditorExportDialog";
import { apiClient } from "@/lib/api";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("EditorExportDialog Component", () => {
  it("renders export dialog with resolution options and submit button", () => {
    renderWithClient(
      <EditorExportDialog
        isOpen={true}
        onClose={vi.fn()}
        clipId="test-clip-1"
        defaultTitle="My Cool Clip"
        onExportStarted={vi.fn()}
      />
    );

    expect(screen.getByText("Export & Render Clip")).toBeInTheDocument();
    expect(screen.getByText("Target Resolution")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Export/i })).toBeInTheDocument();
  });

  it("submits render options when clicking Start Export", async () => {
    const mockExportStarted = vi.fn();
    const mockClose = vi.fn();

    vi.spyOn(apiClient, "createRender").mockResolvedValueOnce({
      id: "render-123",
      clip_id: "test-clip-1",
      status: "queued",
      progress: 0,
      options: { resolution: "1080p", fps: 60, quality: "high" },
      file_size: null,
      duration_sec: 15,
      width: 1920,
      height: 1080,
      error_message: null,
      created_at: new Date().toISOString(),
      finished_at: null,
    });

    renderWithClient(
      <EditorExportDialog
        isOpen={true}
        onClose={mockClose}
        clipId="test-clip-1"
        defaultTitle="My Cool Clip"
        onExportStarted={mockExportStarted}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /Start Export/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockExportStarted).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
