"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RotateCcw,
  Download,
  Ban,
  ArrowRight,
  Loader2,
  Film,
  Calendar,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Batch } from "@/types";

export default function BatchesListPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = React.useState(1);
  const limit = 10;

  const {
    data: batchesData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["batches", page],
    queryFn: () => apiClient.getBatches({ page, limit }),
    refetchInterval: 3000, // Reactive polling fallback
  });

  const batches = batchesData?.items || [];
  const total = batchesData?.total || 0;

  const handleCancel = async (id: string) => {
    try {
      await apiClient.cancelBatch(id);
      toast.info("Batch cancelled");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel batch");
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await apiClient.retryFailedBatch(id);
      toast.success("Retrying failed clips in batch...");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to retry batch");
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const res = await apiClient.getBatchDownload(id);
      if (res?.url) {
        window.open(res.url, "_blank");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to download batch ZIP");
    }
  };

  const getStatusBadge = (status: Batch["status"]) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Completed
          </span>
        );
      case "completed_with_errors":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            Partial Success
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Rendering...
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-hover text-text-secondary border border-border">
            <Clock className="w-3.5 h-3.5" />
            Queued
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-hover text-text-secondary/70 border border-border">
            <Ban className="w-3.5 h-3.5" />
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-primary" />
            Batch Exports
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Monitor bulk rendering jobs, retry failed renders, and download combined ZIP packages.
          </p>
        </div>

        <Link href="/clips">
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <Film className="w-4 h-4" />
            Select Clips to Export
          </Button>
        </Link>
      </div>

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-8 text-center bg-surface border border-red-500/20 rounded-2xl space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm text-red-400 font-medium">Failed to load batch exports.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      ) : batches.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl py-16 px-4 text-center bg-surface/30">
          <div className="w-14 h-14 rounded-2xl bg-surface-hover flex items-center justify-center text-text-secondary mx-auto mb-4">
            <Layers className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">No batch exports yet</h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1 mb-5">
            Go to your Clip Library, select multiple clips, and click &ldquo;Batch Export&rdquo; to render in bulk with an ad template.
          </p>
          <Link href="/clips">
            <Button size="sm" className="gap-2">
              <Film className="w-4 h-4" />
              Go to Clip Library
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const percent = batch.total > 0 ? Math.round(((batch.completed + batch.failed) / batch.total) * 100) : 0;
            const isFinished = ["completed", "completed_with_errors", "failed", "cancelled"].includes(batch.status);

            return (
              <div
                key={batch.id}
                className="p-5 rounded-2xl bg-surface border border-border hover:border-border/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-5 group"
              >
                {/* Left: Info & Progress */}
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      href={`/batches/${batch.id}`}
                      className="text-sm font-bold text-text-primary hover:text-primary transition-colors flex items-center gap-1.5"
                    >
                      <span>Batch #{batch.id.slice(0, 8)}</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>

                    {getStatusBadge(batch.status)}

                    <span className="text-[11px] font-mono text-text-secondary">
                      {batch.completed}/{batch.total} completed
                    </span>

                    {batch.failed > 0 && (
                      <span className="text-[11px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                        {batch.failed} failed
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full max-w-md bg-background border border-border/80 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        batch.failed > 0 ? "bg-amber-400" : "bg-primary"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(batch.created_at)}
                    </span>
                    <span className="font-mono text-[11px]">
                      Preset: {batch.options?.resolution || "1080p"} @ {batch.options?.fps || 60}fps
                    </span>
                    {batch.ad_template_id && (
                      <span className="text-[11px] bg-surface-hover px-2 py-0.5 rounded border border-border">
                        Ad Template Applied
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {batch.status === "running" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancel(batch.id)}
                      className="gap-1.5 text-xs text-text-secondary hover:text-error hover:border-error/40"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancel
                    </Button>
                  )}

                  {batch.failed > 0 && isFinished && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetry(batch.id)}
                      className="gap-1.5 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Retry Failed ({batch.failed})
                    </Button>
                  )}

                  {batch.zip_ready && (
                    <Button
                      size="sm"
                      onClick={() => handleDownload(batch.id)}
                      className="gap-1.5 text-xs font-bold shadow-md shadow-primary/20"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download ZIP
                    </Button>
                  )}

                  <Link href={`/batches/${batch.id}`}>
                    <Button size="sm" variant="outline" className="text-xs">
                      View Details
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
