"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Scissors,
  Search,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  List,
  Sparkles,
  Clock,
  Calendar,
  MoreVertical,
  ExternalLink,
  Copy,
  Trash2,
  Download,
  Film,
  CheckSquare,
  Square,
  AlertCircle,
  Play,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatDuration, formatDate } from "@/lib/utils";
import { formatTimestamp } from "@/lib/time-mapping";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EditorExportDialog } from "@/components/editor/EditorExportDialog";
import { BulkResultModal } from "@/components/clips/BulkResultModal";
import { BatchExportDialog } from "@/components/batches/BatchExportDialog";
import { Layers } from "lucide-react";
import type { Clip, BulkActionResponse } from "@/types";

export default function ClipLibraryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");
  const [sortOption, setSortOption] = React.useState<"newest" | "score" | "duration">("newest");
  const [page, setPage] = React.useState(1);
  const limit = 12;

  // Selected clips for bulk action
  const [selectedClipIds, setSelectedClipIds] = React.useState<Set<string>>(new Set());
  const [isBulkSubmitting, setIsBulkSubmitting] = React.useState(false);
  const [bulkResult, setBulkResult] = React.useState<BulkActionResponse | null>(null);
  const [bulkActionType, setBulkActionType] = React.useState<"export" | "delete">("export");
  const [exportClipId, setExportClipId] = React.useState<string | null>(null);
  const [isBatchExportOpen, setIsBatchExportOpen] = React.useState(false);

  // Debounce search input
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Query clips from API
  const {
    data: clipsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["clips", selectedCategory, selectedStatus, debouncedSearch, sortOption, page],
    queryFn: () =>
      apiClient.getClips({
        category: selectedCategory === "all" ? undefined : selectedCategory,
        status: selectedStatus === "all" ? undefined : selectedStatus,
        q: debouncedSearch || undefined,
        sort: sortOption,
        page,
        limit,
      }),
  });

  const clips = clipsData?.items || [];
  const total = clipsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Toggle selection
  const toggleSelectClip = (id: string) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedClipIds.size === clips.length) {
      setSelectedClipIds(new Set());
    } else {
      setSelectedClipIds(new Set(clips.map((c) => c.id)));
    }
  };

  // Bulk actions
  const handleBulkAction = async (action: "export" | "delete") => {
    if (selectedClipIds.size === 0) return;
    if (action === "delete" && !window.confirm(`Delete ${selectedClipIds.size} selected clip(s)?`)) {
      return;
    }

    setIsBulkSubmitting(true);
    setBulkActionType(action);
    try {
      const res = await apiClient.bulkClipAction(action, Array.from(selectedClipIds));
      setBulkResult(res);
      setSelectedClipIds(new Set());
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["clips"] });
    } catch (err: any) {
      toast.error(err.message || "Bulk action failed");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  // Per-clip actions
  const handleDuplicate = async (clip: Clip) => {
    try {
      const copy = await apiClient.duplicateClip(clip.id);
      toast.success("Clip duplicated!");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate clip");
    }
  };

  const handleDelete = async (clip: Clip) => {
    if (!window.confirm(`Delete clip "${clip.title}"?`)) return;
    try {
      await apiClient.deleteClip(clip.id);
      toast.success("Clip deleted");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete clip");
    }
  };

  const handleDownloadLatestRender = async (clipId: string) => {
    try {
      const rendersRes = await apiClient.getClipRenders(clipId);
      const readyRender = rendersRes.items.find((r) => r.status === "ready");
      if (readyRender) {
        const downloadRes = await apiClient.getRenderDownload(readyRender.id);
        if (downloadRes?.url) {
          window.open(downloadRes.url, "_blank");
          return;
        }
      }
      toast.info("No ready export render found. Please render the clip first.");
      setExportClipId(clipId);
    } catch (err: any) {
      toast.error(err.message || "Failed to download render");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2.5">
            <Scissors className="w-6 h-6 text-primary" />
            Clip Library
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Browse, edit, and export your curated highlight clips.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-xl border transition-all ${
              viewMode === "grid"
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-surface border-border text-text-secondary hover:text-text-primary"
            }`}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-xl border transition-all ${
              viewMode === "list"
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-surface border-border text-text-secondary hover:text-text-primary"
            }`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Filter, Search & Sort Bar */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search clips by title or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 bg-background border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="all">All Categories</option>
            <option value="funny">Funny</option>
            <option value="sad">Emotional</option>
            <option value="custom">Custom</option>
          </select>

          {/* Status */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="h-9 px-3 bg-background border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary capitalize"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="rendering">Rendering</option>
            <option value="failed">Failed</option>
          </select>

          {/* Sort */}
          <select
            value={sortOption}
            onChange={(e) => {
              setSortOption(e.target.value as any);
              setPage(1);
            }}
            className="h-9 px-3 bg-background border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="newest">Newest First</option>
            <option value="score">Highest Score</option>
            <option value="duration">Longest Duration</option>
          </select>
        </div>
      </div>

      {/* 3. Bulk Selection Action Bar */}
      {selectedClipIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-3 px-5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3 text-xs font-semibold text-text-primary">
            <span>{selectedClipIds.size} clip{selectedClipIds.size === 1 ? "" : "s"} selected</span>
            <button
              onClick={() => setSelectedClipIds(new Set())}
              className="text-text-secondary hover:text-text-primary underline text-[11px]"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsBatchExportOpen(true)}
              className="h-8 text-xs gap-1.5 font-bold shadow-md shadow-primary/20"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Batch Export ({selectedClipIds.size})</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              isLoading={isBulkSubmitting}
              onClick={() => handleBulkAction("export")}
              className="h-8 text-xs gap-1.5"
            >
              <Film className="w-3.5 h-3.5 text-primary" />
              <span>Direct Export</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              isLoading={isBulkSubmitting}
              onClick={() => handleBulkAction("delete")}
              className="h-8 text-xs gap-1.5 text-error hover:bg-error/10 hover:border-error/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        </div>
      )}

      {/* 4. Clips Grid / List View */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-4 space-y-3">
              <Skeleton className="aspect-video w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      ) : clips.length === 0 ? (
        <div className="p-16 text-center bg-surface border border-dashed border-border rounded-3xl space-y-3 my-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Scissors className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-text-primary">No clips found</h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto leading-relaxed">
            {searchTerm || selectedCategory !== "all"
              ? "No clips match the selected filter criteria. Try adjusting your search query."
              : "Generate viral highlight clips from your stream projects or create custom clips."}
          </p>
          <Link href="/dashboard">
            <Button size="sm" variant="outline" className="mt-2 text-xs">
              Go to Projects
            </Button>
          </Link>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {clips.map((clip) => {
            const isSelected = selectedClipIds.has(clip.id);
            const duration =
              (clip.edit_state?.trim?.end ?? clip.source_end_sec) -
              (clip.edit_state?.trim?.start ?? clip.source_start_sec);

            return (
              <div
                key={clip.id}
                className={`group relative bg-surface border rounded-2xl overflow-hidden transition-all duration-200 flex flex-col hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 ${
                  isSelected ? "border-primary ring-1 ring-primary bg-primary/[0.02]" : "border-border"
                }`}
              >
                {/* Selection Checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelectClip(clip.id);
                  }}
                  className="absolute top-2.5 left-2.5 z-20 p-1 rounded-lg bg-black/60 hover:bg-black/90 text-white backdrop-blur-sm transition-all"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-primary fill-primary/20" />
                  ) : (
                    <Square className="w-4 h-4 text-white/70" />
                  )}
                </button>

                {/* Thumbnail with Hover Preview */}
                <div
                  onClick={() => router.push(`/clips/${clip.id}`)}
                  className="relative aspect-video bg-black/40 cursor-pointer overflow-hidden"
                >
                  {clip.thumbnail_url ? (
                    <img
                      src={clip.thumbnail_url}
                      alt={clip.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-secondary/40">
                      <Film className="w-10 h-10" />
                    </div>
                  )}

                  {/* Play icon overlay on hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center pl-0.5 shadow-lg">
                      <Play className="w-5 h-5 fill-current" />
                    </div>
                  </div>

                  {/* Duration chip */}
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 font-mono text-[10px] text-white font-medium backdrop-blur-sm">
                    {duration.toFixed(1)}s
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border capitalize ${
                          clip.category === "funny"
                            ? "bg-[#9146FF]/15 text-[#bf94ff] border-[#9146FF]/30"
                            : clip.category === "sad"
                            ? "bg-[#06b6d4]/15 text-[#67e8f9] border-[#06b6d4]/30"
                            : "bg-surface-hover text-text-primary border-border"
                        }`}
                      >
                        {clip.category}
                      </span>

                      <span className="text-[10px] text-text-secondary capitalize px-1.5 py-0.5 rounded bg-background border border-border">
                        {clip.status}
                      </span>
                    </div>

                    <h4
                      onClick={() => router.push(`/clips/${clip.id}`)}
                      className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors cursor-pointer line-clamp-2 leading-snug"
                    >
                      {clip.title}
                    </h4>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
                    <span className="text-[11px] text-text-secondary flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(clip.created_at)}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => router.push(`/clips/${clip.id}`)}
                        className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary"
                        title="Open in editor"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDownloadLatestRender(clip.id)}
                        className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary"
                        title="Download latest render"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDuplicate(clip)}
                        className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDelete(clip)}
                        className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-error"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-surface border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {clips.map((clip) => {
            const isSelected = selectedClipIds.has(clip.id);
            const duration =
              (clip.edit_state?.trim?.end ?? clip.source_end_sec) -
              (clip.edit_state?.trim?.start ?? clip.source_start_sec);

            return (
              <div
                key={clip.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-hover/50 transition-colors ${
                  isSelected ? "bg-primary/[0.03]" : ""
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectClip(clip.id)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-background"
                  />

                  <div
                    onClick={() => router.push(`/clips/${clip.id}`)}
                    className="w-24 h-14 bg-black/40 rounded-xl overflow-hidden shrink-0 cursor-pointer relative group"
                  >
                    {clip.thumbnail_url ? (
                      <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-secondary/40">
                        <Film className="w-5 h-5" />
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 px-1 rounded bg-black/80 font-mono text-[9px] text-white">
                      {duration.toFixed(1)}s
                    </span>
                  </div>

                  <div className="space-y-1 min-w-0">
                    <h4
                      onClick={() => router.push(`/clips/${clip.id}`)}
                      className="text-sm font-bold text-text-primary hover:text-primary transition-colors cursor-pointer truncate"
                    >
                      {clip.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="capitalize">{clip.category}</span>
                      <span>&bull;</span>
                      <span className="capitalize">{clip.status}</span>
                      <span>&bull;</span>
                      <span>{formatDate(clip.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/clips/${clip.id}`)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Editor</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadLatestRender(clip.id)}
                    className="h-8 text-xs gap-1.5"
                    title="Download latest render"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>

                  <button
                    onClick={() => handleDuplicate(clip)}
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(clip)}
                    className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-error"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border text-xs text-text-secondary">
          <span>
            Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total} clips
          </span>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs"
            >
              Previous
            </Button>
            <span className="font-mono px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Result Modal */}
      <BulkResultModal
        isOpen={!!bulkResult}
        onClose={() => setBulkResult(null)}
        result={bulkResult}
        action={bulkActionType}
      />

      {/* Export Dialog for per-clip Export */}
      {exportClipId && (
        <EditorExportDialog
          isOpen={!!exportClipId}
          onClose={() => setExportClipId(null)}
          clipId={exportClipId}
          onExportStarted={() => {
            queryClient.invalidateQueries({ queryKey: ["clips"] });
          }}
        />
      )}

      {/* Batch Export Dialog */}
      <BatchExportDialog
        isOpen={isBatchExportOpen}
        onClose={() => setIsBatchExportOpen(false)}
        selectedClipIds={Array.from(selectedClipIds)}
        clipTitles={clips.reduce<Record<string, string>>((acc, c) => {
          acc[c.id] = c.title;
          return acc;
        }, {})}
      />
    </div>
  );
}
