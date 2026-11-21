import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BatchExportDialog } from "../BatchExportDialog";
import { apiClient } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("BatchExportDialog Component", () => {
  it("renders batch export dialog with selected clips and options", () => {
    renderWithClient(
      <BatchExportDialog
        isOpen={true}
        onClose={vi.fn()}
        selectedClipIds={["clip-1", "clip-2"]}
        clipTitles={{ "clip-1": "First Clip", "clip-2": "Second Clip" }}
      />
    );

    expect(screen.getByText("Batch Export Clips")).toBeInTheDocument();
    expect(screen.getByText("Target Clips (2)")).toBeInTheDocument();
    expect(screen.getByText("First Clip")).toBeInTheDocument();
    expect(screen.getByText("Second Clip")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Batch Export \(2\)/i })).toBeInTheDocument();
  });

  it("calls apiClient.createBatch on submit", async () => {
    const mockBatch = {
      id: "batch-123",
      status: "queued" as const,
      total: 2,
      completed: 0,
      failed: 0,
      ad_template_id: null,
      options: { resolution: "1080p", fps: 60, quality: "high" },
      items: [
        { clip_id: "clip-1", render_id: null, status: "queued", error_message: null },
        { clip_id: "clip-2", render_id: null, status: "queued", error_message: null },
      ],
      zip_ready: false,
      created_at: new Date().toISOString(),
      finished_at: null,
    };

    const createBatchSpy = vi.spyOn(apiClient, "createBatch").mockResolvedValueOnce(mockBatch);
    const mockClose = vi.fn();

    renderWithClient(
      <BatchExportDialog
        isOpen={true}
        onClose={mockClose}
        selectedClipIds={["clip-1", "clip-2"]}
        clipTitles={{ "clip-1": "First Clip", "clip-2": "Second Clip" }}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /Start Batch Export/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createBatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          clip_ids: ["clip-1", "clip-2"],
          options: expect.objectContaining({
            resolution: "1080p",
            fps: 60,
          }),
        })
      );
    });
  });
});
