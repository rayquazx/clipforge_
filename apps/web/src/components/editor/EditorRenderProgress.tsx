"use client";

import * as React from "react";
import {
  Download,
  XCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import type { Render } from "@/types";

interface EditorRenderProgressProps {
  render: Render;
  onCancelled?: () => void;
  onRetry?: () => void;
}

export function EditorRenderProgress({
  render,
  onCancelled,
  onRetry,
}: EditorRenderProgressProps) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await apiClient.getRenderDownload(render.id);
      if (res?.url) {
        window.open(res.url, "_blank");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to get download URL");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await apiClient.cancelRender(render.id);
      toast.info("Render cancelled");
      onCancelled?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel render");
    } finally {
      setIsCancelling(false);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "Unknown size";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Determine active stage label
  const getStageLabel = () => {
    if (render.status === "downloading") return "Step 1/3: Downloading source stream...";
    if (render.status === "rendering") return "Step 2/3: Applying filters & rendering...";
    if (render.status === "queued") return "Queued in render pipeline...";
    if (render.status === "ready") return "Render complete & ready for download!";
    if (render.status === "failed") return "Rendering failed";
    if (render.status === "cancelled") return "Render cancelled";
    return "Finalizing media...";
  };

  return (
    <div className="p-4 rounded-xl bg-background border border-border space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {render.status === "ready" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : render.status === "failed" ? (
            <AlertCircle className="w-4 h-4 text-error" />
          ) : (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          )}
          <span className="font-semibold text-text-primary capitalize">{render.status}</span>
        </div>

        <span className="text-[11px] font-mono text-text-secondary">
          {render.options.resolution} &bull; {render.options.fps}fps
        </span>
      </div>

      {/* Progress Bar (when active) */}
      {(render.status === "queued" ||
        render.status === "downloading" ||
        render.status === "rendering") && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-text-secondary">
            <span>{getStageLabel()}</span>
            <span className="font-mono font-bold text-text-primary">{render.progress}%</span>
          </div>
          <div className="w-full h-2 bg-surface rounded-full overflow-hidden border border-border">
            <div
              className="bg-primary h-full transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(5, render.progress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Ready State Details & Download */}
      {render.status === "ready" && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-xs text-text-secondary bg-surface p-2.5 rounded-lg border border-border">
            <span className="flex items-center gap-1.5 font-medium text-text-primary">
              <Film className="w-3.5 h-3.5 text-primary" />
              {render.options.filename || "clip.mp4"}
            </span>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span>{formatFileSize(render.file_size)}</span>
              {render.duration_sec && <span>{render.duration_sec.toFixed(1)}s</span>}
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleDownload}
            isLoading={isDownloading}
            className="w-full gap-2 text-xs font-bold"
          >
            <Download className="w-3.5 h-3.5" />
            Download MP4
          </Button>
        </div>
      )}

      {/* Failed State */}
      {render.status === "failed" && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-error bg-error/10 p-2.5 rounded-lg border border-error/20">
            {render.error_message || "An unexpected error occurred during rendering."}
          </p>
          {onRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="w-full gap-2 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Render
            </Button>
          )}
        </div>
      )}

      {/* Cancel button when active */}
      {(render.status === "downloading" ||
        render.status === "rendering" ||
        render.status === "queued") && (
        <div className="flex justify-end pt-1">
          <button
            onClick={handleCancel}
            disabled={isCancelling}
            className="text-[11px] text-text-secondary hover:text-error flex items-center gap-1 transition-colors"
          >
            <XCircle className="w-3 h-3" />
            <span>Cancel render</span>
          </button>
        </div>
      )}
    </div>
  );
}
