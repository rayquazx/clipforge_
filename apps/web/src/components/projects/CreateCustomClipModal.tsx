"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Scissors, AlertCircle, Clock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api";
import { formatTimestamp, parseTimestamp } from "@/lib/time-mapping";
import { useToast } from "@/components/ui/Toast";
import type { Clip } from "@/types";

interface CreateCustomClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  videoDuration?: number | null;
  onClipCreated: (clip: Clip) => void;
}

export function CreateCustomClipModal({
  isOpen,
  onClose,
  projectId,
  videoDuration,
  onClipCreated,
}: CreateCustomClipModalProps) {
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [startTimeStr, setStartTimeStr] = React.useState("00:00:10.000");
  const [endTimeStr, setEndTimeStr] = React.useState("00:00:30.000");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch /config for max_clip_seconds
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: () => apiClient.getConfig(),
  });

  const maxClipSeconds = config?.max_clip_seconds || 60;

  const startSec = parseTimestamp(startTimeStr) ?? 0;
  const endSec = parseTimestamp(endTimeStr) ?? 0;
  const duration = Math.max(0, endSec - startSec);

  const validate = (): boolean => {
    setError(null);
    if (parseTimestamp(startTimeStr) === null) {
      setError("Start time must be in HH:MM:SS.mmm format or seconds");
      return false;
    }
    if (parseTimestamp(endTimeStr) === null) {
      setError("End time must be in HH:MM:SS.mmm format or seconds");
      return false;
    }
    if (startSec < 0) {
      setError("Start time cannot be negative");
      return false;
    }
    if (videoDuration && endSec > videoDuration) {
      setError(`End time cannot exceed video duration (${videoDuration.toFixed(1)}s)`);
      return false;
    }
    if (duration < 1) {
      setError("Clip length must be at least 1.0 second");
      return false;
    }
    if (duration > maxClipSeconds) {
      setError(`Clip length cannot exceed maximum allowed limit (${maxClipSeconds} seconds)`);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const clip = await apiClient.createCustomClip(projectId, {
        start: startSec,
        end: endSec,
        title: title.trim() || undefined,
      });
      toast.success("Custom clip created successfully!");
      onClipCreated(clip);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create custom clip");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Custom Clip" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-text-secondary">
          Extract a specific section of your video into an editable clip.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-error/10 border border-error/20 flex items-start gap-2.5 text-xs text-error">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Input
          label="Clip Title (Optional)"
          placeholder="e.g. Boss Fight Climax"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start Time"
            placeholder="00:00:10.000"
            value={startTimeStr}
            onChange={(e) => setStartTimeStr(e.target.value)}
            helperText="HH:MM:SS.mmm"
          />

          <Input
            label="End Time"
            placeholder="00:00:30.000"
            value={endTimeStr}
            onChange={(e) => setEndTimeStr(e.target.value)}
            helperText="HH:MM:SS.mmm"
          />
        </div>

        {/* Duration badge */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-border text-xs">
          <span className="text-text-secondary flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" />
            Selected Length:
          </span>
          <span
            className={`font-mono font-bold ${
              duration < 1 || duration > maxClipSeconds ? "text-error" : "text-emerald-400"
            }`}
          >
            {duration.toFixed(2)}s (Max: {maxClipSeconds}s)
          </span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isSubmitting} className="gap-2">
            <Scissors className="w-4 h-4" />
            Create Clip
          </Button>
        </div>
      </form>
    </Modal>
  );
}
