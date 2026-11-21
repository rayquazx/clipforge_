"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  History,
  RotateCw,
  Sparkles,
  Layers,
  Scissors,
} from "lucide-react";
import { Project, Analysis, Moment, SignalWindow, Clip } from "@/types";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatDuration, formatDate } from "@/lib/utils";
import api, { apiClient } from "@/lib/api";

import { AnalyzePanel } from "@/components/analysis/AnalyzePanel";
import { AnalysisProgressView } from "@/components/analysis/AnalysisProgressView";
import { EmbeddedPlayer } from "@/components/analysis/EmbeddedPlayer";
import { MomentsTimelineChart } from "@/components/analysis/MomentsTimelineChart";
import { MomentCard } from "@/components/analysis/MomentCard";
import { CreateCustomClipModal } from "@/components/projects/CreateCustomClipModal";
import { useAnalysisEvents } from "@/hooks/useAnalysisEvents";

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.id as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedAnalysisId, setSelectedAnalysisId] = React.useState<string | null>(null);
  const [playerSeekTime, setPlayerSeekTime] = React.useState<number>(0);
  const [selectedMomentIds, setSelectedMomentIds] = React.useState<Set<string>>(new Set());
  const [activeMomentId, setActiveMomentId] = React.useState<string | null>(null);
  const [isStartingAnalysis, setIsStartingAnalysis] = React.useState(false);
  const [isCustomClipModalOpen, setIsCustomClipModalOpen] = React.useState(false);
  const [isCreatingClips, setIsCreatingClips] = React.useState(false);

  // 1. Fetch Project Details
  const { data: project, isLoading: isProjectLoading, isError: isProjectError } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}`);
      return res.data;
    },
    enabled: !!projectId,
  });

  // 2. Fetch Analysis History for Project
  const { data: analyses, refetch: refetchAnalyses } = useQuery<Analysis[]>({
    queryKey: ["project-analyses", projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/analyses`);
      return res.data;
    },
    enabled: !!projectId,
  });

  // Auto-select latest analysis when loaded
  React.useEffect(() => {
    if (analyses && analyses.length > 0 && !selectedAnalysisId) {
      setSelectedAnalysisId(analyses[0].id);
    }
  }, [analyses, selectedAnalysisId]);

  // Current active analysis
  const currentAnalysis = analyses?.find((a) => a.id === selectedAnalysisId) || analyses?.[0];

  // 3. Listen to live SSE updates for active in-progress analysis
  useAnalysisEvents(currentAnalysis?.id || null, currentAnalysis?.status, {
    onUpdate: (updatedData) => {
      queryClient.setQueryData<Analysis[]>(["project-analyses", projectId], (old) => {
        if (!old) return old;
        return old.map((a) =>
          a.id === currentAnalysis?.id ? { ...a, ...updatedData } : a
        );
      });
      if (updatedData.status === "ready") {
        queryClient.invalidateQueries({ queryKey: ["analysis-moments", currentAnalysis?.id] });
        queryClient.invalidateQueries({ queryKey: ["analysis-signals", currentAnalysis?.id] });
        toast.success("Moment detection complete!");
      }
    },
  });

  // 4. Fetch Moments for current analysis
  const { data: moments = [], refetch: refetchMoments } = useQuery<Moment[]>({
    queryKey: ["analysis-moments", currentAnalysis?.id],
    queryFn: async () => {
      if (!currentAnalysis?.id || currentAnalysis.status !== "ready") return [];
      const res = await api.get(`/analyses/${currentAnalysis.id}/moments`);
      return res.data;
    },
    enabled: !!currentAnalysis?.id && currentAnalysis.status === "ready",
  });

  // 5. Fetch Signal Timeline Windows for current analysis
  const { data: signals = [] } = useQuery<SignalWindow[]>({
    queryKey: ["analysis-signals", currentAnalysis?.id],
    queryFn: async () => {
      if (!currentAnalysis?.id || currentAnalysis.status !== "ready") return [];
      const res = await api.get(`/analyses/${currentAnalysis.id}/signals?downsample=1`);
      return res.data;
    },
    enabled: !!currentAnalysis?.id && currentAnalysis.status === "ready",
  });

  // 6. Fetch existing Clips for this project
  const { data: projectClips = [], refetch: refetchProjectClips } = useQuery<Clip[]>({
    queryKey: ["project-clips", projectId],
    queryFn: async () => {
      const res = await apiClient.getClips({ project_id: projectId });
      return res.items;
    },
    enabled: !!projectId,
  });

  // Clip creation handlers
  const handleCreateClips = async (momentIds: string[]) => {
    if (!currentAnalysis?.id || momentIds.length === 0) return;
    setIsCreatingClips(true);
    try {
      const res = await apiClient.createClipsFromMoments(currentAnalysis.id, momentIds);
      await refetchProjectClips();
      queryClient.invalidateQueries({ queryKey: ["clips"] });
      toast.success(`Created ${res.items.length} clip${res.items.length === 1 ? "" : "s"}!`);
      setSelectedMomentIds(new Set());
      return res.items;
    } catch (err: any) {
      toast.error(err.message || "Failed to create clips");
    } finally {
      setIsCreatingClips(false);
    }
  };

  const handleOpenInEditor = async (moment: Moment) => {
    const existing = projectClips.find((c) => c.moment_id === moment.id);
    if (existing) {
      router.push(`/clips/${existing.id}`);
      return;
    }
    const created = await handleCreateClips([moment.id]);
    if (created && created.length > 0) {
      router.push(`/clips/${created[0].id}`);
    }
  };

  // Start new analysis
  const handleStartAnalysis = async (params: {
    mode: string;
    min_clip_seconds: number;
    max_clip_seconds: number;
    max_clips: number;
    language: string;
  }) => {
    setIsStartingAnalysis(true);
    try {
      const res = await api.post(`/projects/${projectId}/analyses`, params);
      const newAnalysis: Analysis = res.data;
      setSelectedAnalysisId(newAnalysis.id);
      await refetchAnalyses();
      toast.success("Analysis started!");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to start analysis.");
    } finally {
      setIsStartingAnalysis(false);
    }
  };

  const handleSeek = (seconds: number) => {
    setPlayerSeekTime(seconds);
  };

  const handleMomentSelectToggle = (id: string) => {
    setSelectedMomentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMomentPlay = (moment: Moment) => {
    setActiveMomentId(moment.id);
    handleSeek(moment.start_sec);
  };

  const handleMomentTimeChange = (id: string, start: number, end: number) => {
    queryClient.setQueryData<Moment[]>(["analysis-moments", currentAnalysis?.id], (old) => {
      if (!old) return old;
      return old.map((m) => (m.id === id ? { ...m, start_sec: start, end_sec: end } : m));
    });
    toast.success("Moment duration updated");
  };

  const handleMomentRemove = (id: string) => {
    queryClient.setQueryData<Moment[]>(["analysis-moments", currentAnalysis?.id], (old) => {
      if (!old) return old;
      return old.filter((m) => m.id !== id);
    });
    toast.info("Moment removed from list");
  };

  if (isProjectLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (isProjectError || !project) {
    return (
      <div className="max-w-md mx-auto text-center py-20 space-y-4">
        <p className="text-sm text-red-400 font-medium">Project not found or access denied.</p>
        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Return to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const isAnalysisRunning =
    currentAnalysis &&
    currentAnalysis.status !== "ready" &&
    currentAnalysis.status !== "failed" &&
    currentAnalysis.status !== "cancelled";

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 text-text-secondary hover:text-text-primary">
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>
          </Link>
          <span className="text-text-secondary/40">/</span>
          <span className="text-sm font-semibold text-text-primary truncate max-w-sm">
            {project.title}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCustomClipModalOpen(true)}
            className="gap-2 text-xs h-9 font-medium"
          >
            <Scissors className="w-3.5 h-3.5 text-primary" />
            Create Custom Clip
          </Button>

          {/* Analysis Run Selector (Re-run history) */}
          {analyses && analyses.length > 0 && (
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-text-secondary shrink-0" />
              <select
                value={selectedAnalysisId || ""}
                onChange={(e) => setSelectedAnalysisId(e.target.value)}
                className="h-9 px-3 text-xs bg-surface border border-border rounded-xl text-text-primary focus-ring"
              >
                {analyses.map((a, idx) => (
                  <option key={a.id} value={a.id}>
                    Run #{analyses.length - idx} ({a.mode.toUpperCase()} &bull; {a.status})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 2. Video Player Preview & Metadata Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <EmbeddedPlayer project={project} seekTime={playerSeekTime} />
        </div>

        {/* Project Info Card */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          <div className="space-y-1">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 capitalize mb-1">
              {project.source_type} Stream
            </span>
            <h3 className="text-base font-bold text-text-primary leading-snug">
              {project.title}
            </h3>
            <p className="text-xs text-text-secondary">
              Channel: <span className="text-text-primary font-medium">{project.channel_name || "Unknown"}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-xs text-text-secondary">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <span>{formatDuration(project.duration_seconds)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary shrink-0" />
              <span>{formatDate(project.created_at)}</span>
            </div>
          </div>

          {project.source_url && !project.source_url.startsWith("upload://") && (
            <div className="pt-2">
              <a
                href={project.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-hover font-semibold"
              >
                <span>Watch full stream on {project.source_type}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 3. Analysis Control or Progress Display */}
      {isAnalysisRunning ? (
        <AnalysisProgressView
          analysis={currentAnalysis}
          onCancelled={() => refetchAnalyses()}
        />
      ) : (
        <AnalyzePanel
          onStartAnalysis={handleStartAnalysis}
          isLoading={isStartingAnalysis}
        />
      )}

      {/* 4. Results Section (Signals Chart & Moments List) */}
      {currentAnalysis?.status === "ready" && (
        <div className="space-y-6">
          {/* Signal Timeline Chart */}
          <MomentsTimelineChart
            signals={signals}
            moments={moments}
            selectedMomentId={activeMomentId}
            onSeek={handleSeek}
          />

          {/* Ranked Moments List Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
            <div>
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Detected Moments ({moments.length})
              </h3>
              <p className="text-xs text-text-secondary">
                Ranked by emotional intensity and audio reaction peaks. Click any moment to jump to that timestamp.
              </p>
            </div>

            {moments.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-secondary">
                  {selectedMomentIds.size} of {moments.length} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (selectedMomentIds.size === moments.length) {
                      setSelectedMomentIds(new Set());
                    } else {
                      setSelectedMomentIds(new Set(moments.map((m) => m.id)));
                    }
                  }}
                  className="text-xs h-8"
                >
                  {selectedMomentIds.size === moments.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
            )}
          </div>

          {/* Moments Cards Grid */}
          {moments.length === 0 ? (
            <div className="p-12 text-center bg-surface border border-dashed border-border rounded-2xl space-y-2">
              <p className="text-sm font-semibold text-text-primary">
                No moments detected with current threshold settings.
              </p>
              <p className="text-xs text-text-secondary">
                Try running another analysis with a wider clip length range or &quot;Both&quot; mode.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {moments.map((moment) => {
                const existing = projectClips.find((c) => c.moment_id === moment.id);
                return (
                  <MomentCard
                    key={moment.id}
                    moment={moment}
                    isSelected={selectedMomentIds.has(moment.id)}
                    isActive={activeMomentId === moment.id}
                    existingClip={existing}
                    isCreating={isCreatingClips}
                    onSelectToggle={handleMomentSelectToggle}
                    onPlayClick={() => handleMomentPlay(moment)}
                    onTimeChange={handleMomentTimeChange}
                    onRemove={handleMomentRemove}
                    onCreateClip={(m) => handleCreateClips([m.id])}
                    onOpenInEditor={handleOpenInEditor}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sticky batch creation bar */}
      {selectedMomentIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-surface/95 backdrop-blur-md border border-primary/40 shadow-2xl shadow-primary/20 px-6 py-3.5 rounded-2xl flex items-center gap-4 transition-all">
          <span className="text-xs font-semibold text-text-primary">
            {selectedMomentIds.size} moment{selectedMomentIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button
            size="sm"
            isLoading={isCreatingClips}
            onClick={() => handleCreateClips(Array.from(selectedMomentIds))}
            className="gap-2 text-xs font-bold"
          >
            <Scissors className="w-3.5 h-3.5" />
            Create clips from selected ({selectedMomentIds.size})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedMomentIds(new Set())}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Custom Clip Modal */}
      <CreateCustomClipModal
        isOpen={isCustomClipModalOpen}
        onClose={() => setIsCustomClipModalOpen(false)}
        projectId={projectId}
        videoDuration={project?.duration_seconds}
        onClipCreated={(clip) => {
          refetchProjectClips();
          router.push(`/clips/${clip.id}`);
        }}
      />
    </div>
  );
}
