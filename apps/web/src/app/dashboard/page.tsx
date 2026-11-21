"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronLeft, ChevronRight, Video, Sparkles } from "lucide-react";
import { Project, PaginatedProjects } from "@/types";
import { SourceInput } from "@/components/projects/SourceInput";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import api from "@/lib/api";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const limit = 9;

  // React Query for paginated project list
  const { data, isLoading, isError, refetch } = useQuery<PaginatedProjects>({
    queryKey: ["projects", page],
    queryFn: async () => {
      const response = await api.get(`/projects?page=${page}&limit=${limit}`);
      return response.data;
    },
    staleTime: 5000,
  });

  const handleProjectCreated = () => {
    // Invalidate query and jump to first page to see the new project
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    setPage(1);
  };

  const handleProjectDeleted = (id: string) => {
    queryClient.setQueryData<PaginatedProjects>(["projects", page], (old) => {
      if (!old) return old;
      return {
        ...old,
        total: Math.max(0, old.total - 1),
        items: old.items.filter((p) => p.id !== id),
      };
    });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const handleStatusUpdated = (id: string, updated: Partial<Project>) => {
    queryClient.setQueryData<PaginatedProjects>(["projects", page], (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((p) => (p.id === id ? { ...p, ...updated } : p)),
      };
    });
  };

  const items = data?.items || [];
  const totalPages = data?.total_pages || 1;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* 1. Top Source URL Input & File Upload */}
      <SourceInput onProjectCreated={handleProjectCreated} />

      {/* 2. Permission & Terms Note */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-surface/60 border border-border text-xs text-text-secondary">
        <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p>
          <strong className="text-text-primary font-medium">
            Copyright & Usage Note:
          </strong>{" "}
          Only process stream VODs and video content you own or have explicit
          permission to clip. Respect copyright, DMCA guidelines, and platform
          terms of service.
        </p>
      </div>

      {/* 3. Projects Grid Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text-primary">
              Your Stream Projects
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Select any ready project to explore clips and prepare exports
            </p>
          </div>
          {data && data.total > 0 && (
            <span className="text-xs text-text-secondary font-medium bg-surface px-3 py-1 rounded-full border border-border">
              {data.total} {data.total === 1 ? "project" : "projects"}
            </span>
          )}
        </div>

        {/* 4. Project Cards Grid / States */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center bg-surface border border-red-500/20 rounded-2xl space-y-3">
            <p className="text-sm text-red-400 font-medium">
              Failed to load projects. Please ensure the backend API is running.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-border rounded-2xl py-16 px-4 text-center bg-surface/30">
            <div className="w-14 h-14 rounded-2xl bg-surface-hover flex items-center justify-center text-text-secondary mx-auto mb-4">
              <Video className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">
              No projects added yet
            </h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto mt-1 mb-5">
              Paste a Twitch VOD, YouTube, or Kick link above to import your
              stream recording and fetch its metadata.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDeleted={handleProjectDeleted}
                onStatusUpdated={handleStatusUpdated}
              />
            ))}
          </div>
        )}

        {/* 5. Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-6 border-t border-border">
            <p className="text-xs text-text-secondary">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
