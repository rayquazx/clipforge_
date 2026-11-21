"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Layers,
  Sparkles,
  AlertTriangle,
  Film,
  CheckCircle2,
  X,
  Sliders,
  FileVideo,
  Info,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { AdTemplate, RenderOptions } from "@/types";

interface BatchExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClipIds: string[];
  clipTitles?: Record<string, string>;
}

export function BatchExportDialog({
  isOpen,
  onClose,
  selectedClipIds,
  clipTitles = {},
}: BatchExportDialogProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null);
  const [adsMode, setAdsMode] = React.useState<"keep" | "replace" | "append">("replace");
  const [resolution, setResolution] = React.useState<"720p" | "1080p" | "4k">("1080p");
  const [fps, setFps] = React.useState<30 | 60>(60);
  const [quality, setQuality] = React.useState<"draft" | "medium" | "high">("high");
  const [filenamePattern, setFilenamePattern] = React.useState("{title}_{resolution}");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Fetch templates for picker
  const { data: templatesData } = useQuery({
    queryKey: ["ad-templates"],
    queryFn: () => apiClient.getAdTemplates(),
    enabled: isOpen,
  });

  const templates = templatesData?.items || [];

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClipIds.length === 0) return;

    setIsSubmitting(true);
    try {
      const options: RenderOptions = {
        resolution,
        fps,
        quality,
        filename: filenamePattern,
      };

      const batch = await apiClient.createBatch({
        clip_ids: selectedClipIds,
        ad_template_id: selectedTemplateId || undefined,
        ads_mode: selectedTemplateId ? adsMode : "keep",
        options,
      });

      toast.success(`Batch export created for ${selectedClipIds.length} clip(s)!`);
      onClose();
      router.push(`/batches/${batch.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create batch export");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-surface-hover/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Batch Export Clips</h3>
              <p className="text-xs text-text-secondary">
                Render {selectedClipIds.length} selected highlight clip{selectedClipIds.length === 1 ? "" : "s"} with ad templates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 1. Clips Selection Summary */}
          <div className="p-4 rounded-xl bg-background border border-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-primary flex items-center gap-1.5">
                <FileVideo className="w-3.5 h-3.5 text-primary" />
                Target Clips ({selectedClipIds.length})
              </span>
              <span className="text-[11px] font-mono text-text-secondary">Non-destructive render</span>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 text-xs text-text-secondary pr-1">
              {selectedClipIds.map((id, idx) => (
                <div key={id} className="flex items-center justify-between truncate py-0.5">
                  <span className="truncate">{clipTitles[id] || `Clip #${idx + 1} (${id.slice(0, 8)})`}</span>
                  <span className="font-mono text-[10px] text-text-secondary shrink-0 ml-2">Ready</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Ad Template Picker */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-text-primary flex items-center justify-between">
              <span>Apply Ad Template (Optional)</span>
              {selectedTemplateId && (
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId(null)}
                  className="text-[11px] text-primary hover:underline"
                >
                  Clear template
                </button>
              )}
            </label>

            <select
              value={selectedTemplateId || ""}
              onChange={(e) => setSelectedTemplateId(e.target.value || null)}
              className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm font-medium text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="">None (Use each clip&apos;s own existing ads)</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.placements?.length || 0} placements)
                </option>
              ))}
            </select>
          </div>

          {/* 3. Ads Mode (Visible if template selected) */}
          {selectedTemplateId && (
            <div className="space-y-2 p-3.5 rounded-xl bg-background border border-border/70">
              <span className="text-xs font-semibold text-text-primary block">
                Template Application Mode
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAdsMode("replace")}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    adsMode === "replace"
                      ? "bg-primary/10 border-primary text-text-primary font-semibold"
                      : "border-border text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <div className="text-xs font-bold">Replace</div>
                  <div className="text-[10px] opacity-75 mt-0.5">Overwrite existing clip ads</div>
                </button>

                <button
                  type="button"
                  onClick={() => setAdsMode("append")}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    adsMode === "append"
                      ? "bg-primary/10 border-primary text-text-primary font-semibold"
                      : "border-border text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <div className="text-xs font-bold">Append</div>
                  <div className="text-[10px] opacity-75 mt-0.5">Keep clip ads + add template</div>
                </button>

                <button
                  type="button"
                  onClick={() => setAdsMode("keep")}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    adsMode === "keep"
                      ? "bg-primary/10 border-primary text-text-primary font-semibold"
                      : "border-border text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <div className="text-xs font-bold">Keep Existing</div>
                  <div className="text-[10px] opacity-75 mt-0.5">Ignore template if clip has ads</div>
                </button>
              </div>
            </div>
          )}

          {/* 4. Render Options */}
          <div className="space-y-4 pt-2 border-t border-border">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider block">
              Render Quality &amp; Format
            </span>

            <div className="grid grid-cols-2 gap-4">
              {/* Resolution */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                  className="w-full h-9 px-3 bg-background border border-border rounded-xl text-xs font-semibold text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="720p">720p (Fast)</option>
                  <option value="1080p">1080p (Full HD - Recommended)</option>
                  <option value="4k">4K (Ultra HD)</option>
                </select>
              </div>

              {/* Framerate */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Framerate</label>
                <select
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value, 10) as any)}
                  className="w-full h-9 px-3 bg-background border border-border rounded-xl text-xs font-semibold text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS (Smooth Gaming)</option>
                </select>
              </div>
            </div>

            {/* Quality & Filename pattern */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Encoding Quality</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as any)}
                  className="w-full h-9 px-3 bg-background border border-border rounded-xl text-xs font-semibold text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="draft">Draft (Fastest)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High (Best)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Filename Pattern</label>
                <input
                  type="text"
                  value={filenamePattern}
                  onChange={(e) => setFilenamePattern(e.target.value)}
                  placeholder="{title}_{resolution}"
                  className="w-full h-9 px-3 bg-background border border-border rounded-xl text-xs font-mono text-text-primary focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Info Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-hover/50 border border-border text-[11px] text-text-secondary">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              All rendered videos will be packaged into a downloadable ZIP file once complete.
              You can track progress in real-time on the Batches page.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isSubmitting}
              className="gap-2 font-bold px-5 shadow-lg shadow-primary/20"
            >
              <Film className="w-4 h-4" />
              Start Batch Export ({selectedClipIds.length})
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
