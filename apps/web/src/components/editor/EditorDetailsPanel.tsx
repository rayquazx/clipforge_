"use client";

import * as React from "react";
import {
  ExternalLink,
  Sparkles,
  MessageSquareQuote,
  Clock,
  Download,
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEditorStore } from "@/stores/editor-store";
import { apiClient } from "@/lib/api";
import { formatTimestamp } from "@/lib/time-mapping";
import { Button } from "@/components/ui/Button";
import { EditorExportDialog } from "./EditorExportDialog";
import { EditorRenderProgress } from "./EditorRenderProgress";
import type { Render } from "@/types";

export function EditorDetailsPanel() {
  const clip = useEditorStore((s) => s.clip);
  const updateTitle = useEditorStore((s) => s.updateTitle);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const latestRender = useEditorStore((s) => s.latestRender);
  const setLatestRender = useEditorStore((s) => s.setLatestRender);

  const [isExportOpen, setIsExportOpen] = React.useState(false);
  const [localTitle, setLocalTitle] = React.useState(clip?.title || "");

  React.useEffect(() => {
    if (clip?.title) {
      setLocalTitle(clip.title);
    }
  }, [clip?.title]);

  const handleTitleBlur = () => {
    if (clip && localTitle.trim() && localTitle !== clip.title) {
      updateTitle(localTitle.trim());
    }
  };

  // Fetch renders history for this clip
  const { data: rendersData, refetch: refetchRenders } = useQuery({
    queryKey: ["clip-renders", clip?.id],
    queryFn: () => (clip ? apiClient.getClipRenders(clip.id) : { items: [], total: 0, page: 1, limit: 10 }),
    enabled: !!clip?.id,
    refetchInterval: 5000,
  });

  const renders = rendersData?.items || [];
  const activeRender = latestRender || renders[0];

  const isFunny = clip?.category === "funny";
  const trimStart = clip?.edit_state?.trim?.start ?? clip?.source_start_sec ?? 0;

  return (
    <div className="w-full lg:w-80 shrink-0 space-y-6 bg-surface border border-border rounded-2xl p-5">
      {/* 1. Header & Autosave status */}
      <div className="flex items-center justify-between gap-2 pb-4 border-b border-border">
        <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
          Clip Details
        </span>

        {/* Autosave Status Badge */}
        <div className="flex items-center gap-1.5 text-xs font-mono font-medium">
          {saveStatus === "saving" && (
            <span className="inline-flex items-center gap-1 text-primary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
          {saveStatus === "unsaved" && (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Unsaved
            </span>
          )}
        </div>
      </div>

      {/* 2. Editable Title */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-text-secondary">Clip Title</label>
        <input
          type="text"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => e.key === "Enter" && handleTitleBlur()}
          placeholder="Clip Title"
          className="w-full h-9 px-3 bg-background border border-border rounded-xl text-sm font-semibold text-text-primary focus:outline-none focus:border-primary"
        />
      </div>

      {/* 3. Badges: Category & Score */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${
            isFunny
              ? "bg-[#9146FF]/15 text-[#bf94ff] border-[#9146FF]/30"
              : clip?.category === "sad"
              ? "bg-[#06b6d4]/15 text-[#67e8f9] border-[#06b6d4]/30"
              : "bg-surface-hover text-text-primary border-border"
          }`}
        >
          {clip?.category === "funny" ? "😂 Funny" : clip?.category === "sad" ? "😢 Emotional" : "✂️ Custom"}
        </span>

        {clip?.score !== null && clip?.score !== undefined && (
          <span className="text-[11px] font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
            {Math.round(clip.score * 100)}% Intensity
          </span>
        )}

        <span className="text-[11px] font-mono text-text-secondary px-2 py-0.5 rounded bg-background border border-border">
          v{clip?.version || 1}
        </span>
      </div>

      {/* 4. Score Reason (if present) */}
      {clip?.reason && (
        <div className="p-3 rounded-xl bg-background border border-border/80 space-y-1 text-xs">
          <span className="font-semibold text-text-primary flex items-center gap-1.5 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Detection Logic
          </span>
          <p className="text-text-secondary leading-relaxed">{clip.reason}</p>
        </div>
      )}

      {/* 5. Transcript Excerpt (read-only) */}
      {clip?.edit_state?.transcript_excerpt ? (
        <div className="p-3 rounded-xl bg-background border border-border/80 space-y-1.5 text-xs">
          <span className="font-semibold text-text-primary flex items-center gap-1.5 text-[11px]">
            <MessageSquareQuote className="w-3.5 h-3.5 text-primary" />
            Transcript Excerpt
          </span>
          <p className="text-text-secondary italic leading-relaxed">
            &ldquo;{String(clip.edit_state.transcript_excerpt)}&rdquo;
          </p>
        </div>
      ) : null}

      {/* 6. Source Link with Timestamp */}
      <div className="pt-1">
        <a
          href={`#source-timestamp-${trimStart}`}
          onClick={(e) => {
            e.preventDefault();
            navigator.clipboard?.writeText?.(`Timestamp: ${formatTimestamp(trimStart)}`);
          }}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-hover font-medium transition-colors"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Source start: {formatTimestamp(trimStart)}</span>
        </a>
      </div>

      {/* 7. Export Action Button */}
      <div className="pt-2">
        <Button
          onClick={() => setIsExportOpen(true)}
          className="w-full gap-2 text-xs font-bold py-2.5 shadow-lg shadow-primary/20"
        >
          <Film className="w-4 h-4" />
          Export / Render Clip
        </Button>
      </div>

      {/* 8. Active Render Progress */}
      {activeRender && (
        <div className="space-y-2 pt-2 border-t border-border">
          <span className="text-xs font-semibold text-text-primary">Latest Render</span>
          <EditorRenderProgress
            render={activeRender}
            onCancelled={() => {
              setLatestRender(null);
              refetchRenders();
            }}
            onRetry={() => setIsExportOpen(true)}
          />
        </div>
      )}

      {/* 9. Render History list */}
      {renders.length > 1 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <span className="text-xs font-semibold text-text-secondary">Previous Exports ({renders.length})</span>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {renders.slice(1).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-2 rounded-lg bg-background border border-border text-[11px]"
              >
                <div className="truncate max-w-[140px]">
                  <span className="font-medium text-text-primary truncate block">
                    {r.options.filename || `Render ${r.id.slice(0, 6)}`}
                  </span>
                  <span className="text-text-secondary capitalize">{r.status}</span>
                </div>
                {r.status === "ready" && (
                  <button
                    onClick={async () => {
                      const res = await apiClient.getRenderDownload(r.id);
                      if (res?.url) window.open(res.url, "_blank");
                    }}
                    className="p-1 rounded bg-surface hover:bg-surface-hover text-primary"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Dialog */}
      {clip && (
        <EditorExportDialog
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          clipId={clip.id}
          defaultTitle={clip.title}
          onExportStarted={(render) => {
            setLatestRender(render);
            refetchRenders();
          }}
        />
      )}
    </div>
  );
}
