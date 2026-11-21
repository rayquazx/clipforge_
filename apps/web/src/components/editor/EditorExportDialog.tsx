"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Sliders, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { Render, RenderOptions } from "@/types";

interface EditorExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  defaultTitle?: string;
  onExportStarted: (render: Render) => void;
}

export function EditorExportDialog({
  isOpen,
  onClose,
  clipId,
  defaultTitle,
  onExportStarted,
}: EditorExportDialogProps) {
  const { toast } = useToast();

  const [resolution, setResolution] = React.useState<"original" | "1080p" | "720p">("original");
  const [fps, setFps] = React.useState<"original" | 30 | 60>("original");
  const [quality, setQuality] = React.useState<"high" | "medium" | "small">("high");
  const [filename, setFilename] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch /config for allowed resolutions
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => apiClient.getConfig(),
  });

  const allowedResolutions = config?.export_resolutions || ["original", "1080p", "720p"];

  React.useEffect(() => {
    if (defaultTitle && !filename) {
      const sanitized = defaultTitle
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 50);
      setFilename(`${sanitized}.mp4`);
    }
  }, [defaultTitle, filename]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allowedResolutions.includes(resolution)) {
      setError(`Resolution ${resolution} is not supported by server config`);
      return;
    }

    setIsSubmitting(true);
    try {
      const options: RenderOptions = {
        resolution,
        fps,
        quality,
        filename: filename.trim() ? filename.trim() : undefined,
      };

      const render = await apiClient.createRender(clipId, options);
      toast.success("Export queued! Processing render...");
      onExportStarted(render);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to start export");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export & Render Clip" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-text-secondary">
          Configure video rendering parameters for high-definition social media export.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-error/10 border border-error/20 flex items-start gap-2.5 text-xs text-error">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Resolution */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-primary">Target Resolution</label>
          <div className="grid grid-cols-3 gap-2">
            {allowedResolutions.map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => setResolution(res as any)}
                className={`h-9 rounded-xl border text-xs font-medium uppercase transition-all ${
                  resolution === res
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "border-border bg-background text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* FPS & Quality */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-primary">Frame Rate (FPS)</label>
            <select
              value={fps}
              onChange={(e) => {
                const val = e.target.value;
                setFps(val === "original" ? "original" : (parseInt(val, 10) as any));
              }}
              className="w-full h-9 px-3 bg-background border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="original">Original</option>
              <option value="60">60 FPS</option>
              <option value="30">30 FPS</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-primary">Encoding Quality</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as any)}
              className="w-full h-9 px-3 bg-background border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary capitalize"
            >
              <option value="high">High (Crisp)</option>
              <option value="medium">Medium (Fast)</option>
              <option value="small">Small (Mobile)</option>
            </select>
          </div>
        </div>

        {/* Output Filename */}
        <Input
          label="Custom Filename (Optional)"
          placeholder="clip_highlight.mp4"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          helperText="Will be sanitized automatically (.mp4 extension)"
        />

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isSubmitting} className="gap-2">
            <Download className="w-4 h-4" />
            Start Export
          </Button>
        </div>
      </form>
    </Modal>
  );
}
