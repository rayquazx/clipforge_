import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdUploadModal } from "../AdUploadModal";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("AdUploadModal Component", () => {
  it("renders upload modal with drag and drop zone", () => {
    renderWithClient(
      <AdUploadModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("Upload Ad Assets")).toBeInTheDocument();
    expect(screen.getByText(/Click to browse or drag and drop media files/i)).toBeInTheDocument();
    expect(screen.getByText(/Max 200MB per file/i)).toBeInTheDocument();
  });

  it("rejects files exceeding 200MB limit", async () => {
    renderWithClient(
      <AdUploadModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    // Create mock oversized file (250MB)
    const largeFile = new File(["x".repeat(100)], "huge_video.mp4", { type: "video/mp4" });
    Object.defineProperty(largeFile, "size", { value: 250 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/File exceeds maximum size limit/i)).toBeInTheDocument();
    });
  });

  it("rejects unsupported file formats", async () => {
    renderWithClient(
      <AdUploadModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const exeFile = new File(["malicious"], "virus.exe", { type: "application/x-msdownload" });

    fireEvent.change(fileInput, { target: { files: [exeFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Unsupported format/i)).toBeInTheDocument();
    });
  });
});
