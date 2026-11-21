"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Layers,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  RotateCcw,
  Download,
  Ban,
  Loader2,
  Film,
  Calendar,
  ExternalLink,
  Info,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useEventStream } from "@/hooks/useEventStream";
import type { Batch } from "@/types";

export default function BatchDetailPage() {
  const params = useParams();
  const batchId = params?.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const {
    data: batch,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => apiClient.getBatch(batchId),
    enabled: !!batchId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      return ["completed", "completed_with_errors", "failed", "cancelled"].includes(data.status)
        ? false
        : 2000;
    },
  });

  // Listen to SSE batch events
  useEventStream(undefined, {
    onBatchProgress: (data) => {
      if (data.batch_id === batchId) {
        queryClient.invalidateQueries({ queryKey: ["batch", batchId] });
      }
    },
    onBatchCompleted: (data) => {
      if (data.batch_id === batchId) {
        queryClient.invalidateQueries({ queryKey: ["batch", batchId] });
        toast.success("Batch export finished!");
      }
    },
  });

  const handleCancel = async () => {
    if (!batchId) return;
    setIsCancelling(true);
    try {
      await apiClient.cancelBatch(batchId);
      toast.info("Batch cancelled");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel batch");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetry = async () => {
    if (!batchId) return;
    setIsRetrying(true);
    try {
      await apiClient.retryFailedBatch(batchId);
      toast.success("Retrying failed clips...");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to retry batch");
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDownload = async () => {
    if (!batchId) return;
    try {
      const res = await apiClient.getBatchDownload(batchId);
      if (res?.url) {
        window.open(res.url, "_blank");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to download ZIP");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto p-4 animate-in fade-in">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !batch) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center bg-surface border border-red-500/20 rounded-2xl space-y-4 my-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h3 className="text-lg font-bold text-text-primary">Batch not found</h3>
        <p className="text-xs text-text-secondary">The requested batch export job does not exist.</p>
        <Link href="/batches">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Batches
          </Button>
        </Link>
      </div>
    );
  }

  const percent = batch.total > 0 ? Math.round(((batch.completed + batch.failed) / batch.total) * 100) : 0;
  const isFinished = ["completed", "completed_with_errors", "failed", "cancelled"].includes(batch.status);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/batches">
            <Button variant="ghost" size="sm" className="gap-2 text-text-secondary hover:text-text-primary">
              <ArrowLeft className="w-4 h-4" />
              Batches
            </Button>
          </Link>
          <span className="text-text-secondary/40">/</span>
          <span className="text-sm font-semibold text-text-primary font-mono">
            #{batch.id.slice(0, 8)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {batch.status === "running" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              isLoading={isCancelling}
              className="gap-1.5 text-xs text-text-secondary hover:text-error hover:border-error/40"
            >
              <Ban className="w-3.5 h-3.5" />
              Cancel Job
            </Button>
          )}

          {batch.failed > 0 && isFinished && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              isLoading={isRetrying}
              className="gap-1.5 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Failed ({batch.failed})
            </Button>
          )}

          {batch.zip_ready && (
            <Button
              size="sm"
              onClick={handleDownload}
              className="gap-1.5 text-xs font-bold shadow-md shadow-primary/20"
            >
              <Download className="w-3.5 h-3.5" />
              Download All as ZIP
            </Button>
          )}
        </div>
      </div>

      {/* Overview Card */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-text-primary">Batch Export Overview</h2>
              <span className="text-xs font-mono text-text-secondary bg-surface-hover px-2 py-0.5 rounded border border-border">
                {batch.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-text-secondary">
              Created {formatDate(batch.created_at)}
              {batch.finished_at && ` • Finished ${formatDate(batch.finished_at)}`}
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm font-mono">
            <div className="text-right">
              <div className="text-xs text-text-secondary">Processed</div>
              <div className="font-bold text-text-primary">
                {batch.completed + batch.failed} / {batch.total} clips
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Overall Progress</span>
            <span className="font-mono font-bold text-text-primary">{percent}%</span>
          </div>
          <div className="w-full bg-background border border-border/80 h-3 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                batch.failed > 0 ? "bg-amber-400" : "bg-primary"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Configuration Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border text-xs">
          <span className="px-3 py-1 rounded-lg bg-background border border-border font-mono text-text-secondary">
            Resolution: {batch.options?.resolution || "1080p"}
          </span>
          <span className="px-3 py-1 rounded-lg bg-background border border-border font-mono text-text-secondary">
            FPS: {batch.options?.fps || 60}
          </span>
          <span className="px-3 py-1 rounded-lg bg-background border border-border font-mono text-text-secondary">
            Quality: {batch.options?.quality || "high"}
          </span>
          {batch.ad_template_id && (
            <span className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary font-medium">
              Ad Template #{batch.ad_template_id.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Per-Clip Items List */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-surface-hover/30 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            Clips in this Batch ({batch.items?.length || 0})
          </h3>
        </div>

        <div className="divide-y divide-border">
          {batch.items?.map((item, idx) => (
            <div
              key={item.clip_id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-hover/20 transition-colors"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-secondary">#{idx + 1}</span>
                  <Link
                    href={`/clips/${item.clip_id}`}
                    className="text-xs font-semibold text-text-primary hover:text-primary transition-colors flex items-center gap-1 truncate"
                  >
                    <span>Clip {item.clip_id.slice(0, 8)}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </Link>
                </div>
                {item.error_message && (
                  <p className="text-[11px] text-red-400 font-mono">{item.error_message}</p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {item.status === "completed" && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completed
                  </span>
                )}
                {item.status === "running" && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Rendering
                  </span>
                )}
                {item.status === "queued" && (
                  <span className="inline-flex items-center gap-1 text-xs text-text-secondary bg-surface-hover px-2.5 py-1 rounded-full border border-border">
                    <Clock className="w-3.5 h-3.5" />
                    Queued
                  </span>
                )}
                {item.status === "failed" && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                    <XCircle className="w-3.5 h-3.5" />
                    Failed
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
