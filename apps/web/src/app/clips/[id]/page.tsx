"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Scissors,
  Copy,
  Trash2,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { apiClient, ApiError } from "@/lib/api";
import { useEventStream } from "@/hooks/useEventStream";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

import { EditorPlayer } from "@/components/editor/EditorPlayer";
import { EditorTimeline } from "@/components/editor/EditorTimeline";
import { EditorTrimControls } from "@/components/editor/EditorTrimControls";
import { EditorDetailsPanel } from "@/components/editor/EditorDetailsPanel";
import { EditorConflictDialog } from "@/components/editor/EditorConflictDialog";
import { useEditorShortcuts } from "@/components/editor/useEditorShortcuts";

export default function ClipEditorPage() {
  const params = useParams();
  const clipId = params?.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clip = useEditorStore((s) => s.clip);
  const initClip = useEditorStore((s) => s.initClip);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const setPreviewStatus = useEditorStore((s) => s.setPreviewStatus);
  const setWaveform = useEditorStore((s) => s.setWaveform);
  const setThumbnails = useEditorStore((s) => s.setThumbnails);
  const setConflictClip = useEditorStore((s) => s.setConflictClip);
  const setLatestRender = useEditorStore((s) => s.setLatestRender);

  // 1. Fetch Clip details
  const {
    data: fetchedClip,
    isLoading: isClipLoading,
    isError: isClipError,
    error: clipError,
  } = useQuery({
    queryKey: ["clip", clipId],
    queryFn: () => apiClient.getClip(clipId),
    enabled: !!clipId,
  });

  // Initialize store when clip is fetched
  React.useEffect(() => {
    if (fetchedClip) {
      initClip(fetchedClip);
    }
  }, [fetchedClip, initClip]);

  // 2. Fetch Preview Status
  const { data: previewData } = useQuery({
    queryKey: ["preview-status", clipId],
    queryFn: () => apiClient.getPreviewStatus(clipId),
    enabled: !!clipId,
  });

  React.useEffect(() => {
    if (previewData) {
      setPreviewStatus(previewData);
    }
  }, [previewData, setPreviewStatus]);

  // 3. Fetch Waveform
  const { data: waveformData } = useQuery({
    queryKey: ["clip-waveform", clipId],
    queryFn: () => apiClient.getWaveform(clipId),
    enabled: !!clipId,
  });

  React.useEffect(() => {
    if (waveformData) {
      setWaveform(waveformData);
    }
  }, [waveformData, setWaveform]);

  // 4. Fetch Thumbnails sprite
  const { data: thumbnailsData } = useQuery({
    queryKey: ["clip-thumbnails", clipId],
    queryFn: () => apiClient.getThumbnails(clipId),
    enabled: !!clipId,
  });

  React.useEffect(() => {
    if (thumbnailsData) {
      setThumbnails(thumbnailsData);
    }
  }, [thumbnailsData, setThumbnails]);

  // 5. Connect SSE stream for live preview and render progress updates
  useEventStream(clipId, {
    onPreviewProgress: (data) => {
      setPreviewStatus({
        status: "preparing",
        progress: data.progress,
        url: null,
        offset_sec: 0,
        duration_sec: 30,
        padding_sec: 5,
        error_message: null,
      });
    },
    onPreviewReady: () => {
      queryClient.invalidateQueries({ queryKey: ["preview-status", clipId] });
      queryClient.invalidateQueries({ queryKey: ["clip-waveform", clipId] });
      queryClient.invalidateQueries({ queryKey: ["clip-thumbnails", clipId] });
      toast.success("Preview transcoding ready!");
    },
    onPreviewFailed: (data) => {
      setPreviewStatus({
        status: "failed",
        progress: 0,
        url: null,
        offset_sec: 0,
        duration_sec: 0,
        padding_sec: 5,
        error_message: data.message,
      });
    },
    onRenderProgress: (data) => {
      queryClient.invalidateQueries({ queryKey: ["render", data.render_id] });
      queryClient.invalidateQueries({ queryKey: ["clip-renders", clipId] });
    },
    onRenderReady: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clip-renders", clipId] });
      toast.success("Render completed and ready for download!");
    },
  });

  // 6. Autosave Logic (Debounced 1.5s using PATCH)
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const performSave = React.useCallback(async () => {
    const currentClip = useEditorStore.getState().clip;
    if (!currentClip || useEditorStore.getState().saveStatus === "saving") return;

    setSaveStatus("saving");
    try {
      const updated = await apiClient.updateClip(currentClip.id, {
        title: currentClip.title,
        edit_state: currentClip.edit_state,
        version: currentClip.version,
      });

      // Update clip with incremented version from server
      useEditorStore.setState((s) => ({
        clip: s.clip ? { ...s.clip, version: updated.version } : updated,
        saveStatus: "saved",
      }));
      queryClient.invalidateQueries({ queryKey: ["clips"] });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        // 409 Version Conflict!
        const serverClip = err.details?.current_clip || currentClip;
        setConflictClip(serverClip);
        setSaveStatus("unsaved");
      } else {
        setSaveStatus("unsaved");
        toast.error(err.message || "Autosave failed");
      }
    }
  }, [setSaveStatus, setConflictClip, queryClient, toast]);

  // Debounced autosave effect
  React.useEffect(() => {
    if (saveStatus === "unsaved") {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        performSave();
      }, 1500);
    }

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [saveStatus, performSave]);

  // Bind Keyboard Shortcuts
  useEditorShortcuts(() => performSave());

  // Duplicate Clip
  const handleDuplicate = async () => {
    if (!clip) return;
    try {
      const copy = await apiClient.duplicateClip(clip.id);
      toast.success("Clip duplicated successfully!");
      router.push(`/clips/${copy.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate clip");
    }
  };

  // Delete Clip
  const handleDelete = async () => {
    if (!clip || !window.confirm("Are you sure you want to delete this clip?")) return;
    try {
      await apiClient.deleteClip(clip.id);
      toast.success("Clip deleted");
      router.push("/clips");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete clip");
    }
  };

  // Loading Skeleton State
  if (isClipLoading || !clip) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-4 animate-in fade-in">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-8 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-[600px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  // Error State
  if (isClipError) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center bg-surface border border-error/30 rounded-2xl space-y-4 my-12">
        <AlertCircle className="w-12 h-12 text-error mx-auto" />
        <h3 className="text-lg font-bold text-text-primary">Failed to load clip</h3>
        <p className="text-xs text-text-secondary">
          {(clipError as any)?.message || "The requested clip could not be found or you do not have permission."}
        </p>
        <Link href="/clips">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Return to Clip Library
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header: Back Navigation & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/clips">
            <Button variant="ghost" size="sm" className="gap-2 text-text-secondary hover:text-text-primary">
              <ArrowLeft className="w-4 h-4" />
              Clips
            </Button>
          </Link>
          <span className="text-text-secondary/40">/</span>
          <span className="text-sm font-semibold text-text-primary truncate max-w-md">
            {clip.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDuplicate}
            className="gap-2 text-xs h-8"
            title="Duplicate this clip"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            className="gap-2 text-xs h-8 text-error hover:bg-error/10 hover:border-error/40"
            title="Delete clip"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </Button>
        </div>
      </div>

      {/* 2. Main Editor Grid: Player + Timeline on left, Details Panel on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column: Player on top, Timeline below, Trim Controls */}
        <div className="lg:col-span-2 space-y-5 min-w-0">
          <EditorPlayer />
          <EditorTimeline />
          <EditorTrimControls />
        </div>

        {/* Right column: Details Panel, Autosave status, Renders */}
        <EditorDetailsPanel />
      </div>

      {/* 3. Optimistic Concurrency 409 Dialog */}
      <EditorConflictDialog />
    </div>
  );
}
