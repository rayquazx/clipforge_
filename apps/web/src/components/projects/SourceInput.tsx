"use client";

import * as React from "react";
import {
  Link as LinkIcon,
  Plus,
  Upload,
  AlertCircle,
  Tv,
  Youtube,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { detectPlatformFromUrl } from "@/lib/platform-detect";
import api from "@/lib/api";
import { FileUploadModal } from "./FileUploadModal";

interface SourceInputProps {
  onProjectCreated: () => void;
}

export function SourceInput({ onProjectCreated }: SourceInputProps) {
  const { toast } = useToast();
  const [url, setUrl] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isUploadOpen, setIsUploadOpen] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  const detection = React.useMemo(() => detectPlatformFromUrl(url), [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);

    if (!url.trim()) return;

    if (!detection.isValid) {
      toast.error(detection.error || "Please enter a supported stream link.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/projects", { url: url.trim() });
      toast.success("Project created! Fetching stream metadata...");
      setUrl("");
      setTouched(false);
      onProjectCreated();
    } catch (err: any) {
      const msg =
        err.response?.data?.detail || "Failed to create project. Please check the URL.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlatformBadge = () => {
    if (!detection.platform) return null;

    if (detection.platform === "twitch") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#9146FF]/15 text-[#bf94ff] border border-[#9146FF]/30">
          <Tv className="w-3.5 h-3.5" />
          Twitch VOD
        </span>
      );
    }
    if (detection.platform === "youtube") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FF0000]/15 text-[#ff6666] border border-[#FF0000]/30">
          <Youtube className="w-3.5 h-3.5" />
          YouTube
        </span>
      );
    }
    if (detection.platform === "kick") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#53FC18]/15 text-[#73fc42] border border-[#53FC18]/30">
          <Radio className="w-3.5 h-3.5" />
          Kick VOD
        </span>
      );
    }
    return null;
  };

  return (
    <>
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Import Stream or Video
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Paste a link to a Twitch VOD, YouTube video, or Kick VOD to forge clips
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsUploadOpen(true)}
            className="gap-2 shrink-0 self-start sm:self-auto"
          >
            <Upload className="w-3.5 h-3.5 text-primary" />
            Upload File
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary">
                <LinkIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Paste Twitch VOD, YouTube, or Kick link (e.g. https://twitch.tv/videos/...)"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTouched(true);
                }}
                className="w-full h-11 pl-10 pr-32 text-sm bg-background border border-border rounded-xl text-text-primary placeholder:text-text-secondary/50 focus-ring transition-colors"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {getPlatformBadge()}
              </div>
            </div>

            <Button
              type="submit"
              size="md"
              disabled={isSubmitting || !url.trim()}
              isLoading={isSubmitting}
              className="gap-2 shrink-0 h-11 px-5"
            >
              <Plus className="w-4 h-4" />
              Add Video
            </Button>
          </div>

          {/* Inline error feedback */}
          {touched && url.trim() && !detection.isValid && detection.error && (
            <div className="flex items-center gap-2 text-xs text-error font-medium px-1 animate-in fade-in-50">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{detection.error}</span>
            </div>
          )}
        </form>
      </div>

      <FileUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={onProjectCreated}
      />
    </>
  );
}
