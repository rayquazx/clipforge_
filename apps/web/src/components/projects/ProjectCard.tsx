"use client";

import * as React from "react";
import Link from "next/link";
import {
  Tv,
  Youtube,
  Radio,
  Upload,
  Clock,
  Trash2,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Project } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDuration, formatDate } from "@/lib/utils";
import { useProjectEvents } from "@/hooks/useProjectEvents";
import api from "@/lib/api";

interface ProjectCardProps {
  project: Project;
  onDeleted: (id: string) => void;
  onStatusUpdated: (id: string, updated: Partial<Project>) => void;
}

export function ProjectCard({
  project,
  onDeleted,
  onStatusUpdated,
}: ProjectCardProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);

  // Subscribe to live SSE updates for in-flight projects
  useProjectEvents(project.id, project.status, {
    onStatusChange: (updated) => {
      onStatusUpdated(project.id, updated);
      if (updated.status === "ready") {
        toast.success(`'${updated.title || project.title}' is ready for analysis!`);
      } else if (updated.status === "failed") {
        toast.error(`Failed to process '${project.title}'`);
      }
    },
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/projects/${project.id}`);
      toast.success("Project deleted successfully");
      setShowDeleteModal(false);
      onDeleted(project.id);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRetrying(true);
    try {
      const res = await api.post(`/projects/${project.id}/retry`);
      onStatusUpdated(project.id, res.data);
      toast.success("Retrying metadata fetch...");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to retry");
    } finally {
      setIsRetrying(false);
    }
  };

  const getPlatformIcon = () => {
    switch (project.source_type) {
      case "twitch":
        return <Tv className="w-3.5 h-3.5 text-[#bf94ff]" />;
      case "youtube":
        return <Youtube className="w-3.5 h-3.5 text-[#ff6666]" />;
      case "kick":
        return <Radio className="w-3.5 h-3.5 text-[#73fc42]" />;
      case "upload":
      default:
        return <Upload className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  const getStatusChip = () => {
    switch (project.status) {
      case "ready":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Ready
          </span>
        );
      case "fetching_metadata":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            Fetching
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Queued
          </span>
        );
      case "failed":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
    }
  };

  const isReady = project.status === "ready";

  const CardContentWrapper = isReady ? Link : "div";
  const linkProps = isReady ? { href: `/projects/${project.id}` } : {};

  return (
    <>
      <Card
        className={`group overflow-hidden p-0 flex flex-col justify-between transition-all duration-200 border-border ${
          isReady
            ? "hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 cursor-pointer"
            : ""
        }`}
      >
        <CardContentWrapper {...(linkProps as any)} className="block flex-1">
          {/* Thumbnail Preview Area */}
          <div className="relative aspect-video w-full bg-surface-hover overflow-hidden border-b border-border">
            {project.thumbnail_url ? (
              <img
                src={project.thumbnail_url}
                alt={project.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary/40 gap-2">
                {getPlatformIcon()}
                <span className="text-[11px] font-medium uppercase tracking-wider">
                  {project.source_type} Video
                </span>
              </div>
            )}

            {/* Platform badge */}
            <div className="absolute top-2.5 left-2.5 bg-background/80 backdrop-blur-md px-2 py-1 rounded-lg border border-border/80 flex items-center gap-1.5 text-[11px] font-semibold capitalize">
              {getPlatformIcon()}
              <span>{project.source_type}</span>
            </div>

            {/* Status chip */}
            <div className="absolute top-2.5 right-2.5">{getStatusChip()}</div>

            {/* Duration badge */}
            {project.duration_seconds && project.duration_seconds > 0 ? (
              <div className="absolute bottom-2.5 right-2.5 bg-background/90 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-mono font-medium text-text-primary">
                {formatDuration(project.duration_seconds)}
              </div>
            ) : null}
          </div>

          {/* Details Body */}
          <div className="p-4 space-y-2">
            <h4 className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug group-hover:text-primary transition-colors">
              {project.title || "Untitled Video"}
            </h4>

            <div className="flex items-center justify-between text-xs text-text-secondary pt-1">
              <span className="truncate max-w-[140px] font-medium text-text-secondary">
                {project.channel_name || "Unknown Channel"}
              </span>
              <span className="shrink-0 text-[11px]">
                {formatDate(project.created_at)}
              </span>
            </div>

            {/* Failed Error Banner with Retry */}
            {project.status === "failed" && (
              <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 space-y-2">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <p className="line-clamp-2">
                    {project.error_message || "Failed to fetch stream metadata."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  isLoading={isRetrying}
                  className="w-full h-8 text-xs gap-1.5 border-red-500/30 text-red-300 hover:bg-red-500/20"
                >
                  <RotateCw className="w-3 h-3" />
                  Retry Fetching
                </Button>
              </div>
            )}
          </div>
        </CardContentWrapper>

        {/* Card Footer Actions */}
        <div className="px-4 py-3 bg-surface-hover/30 border-t border-border flex items-center justify-between text-xs text-text-secondary">
          {isReady ? (
            <Link
              href={`/projects/${project.id}`}
              className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1"
            >
              <span>View Details</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          ) : (
            <span className="text-[11px] text-text-secondary">
              {project.status === "fetching_metadata"
                ? "Extracting details..."
                : "Processing..."}
            </span>
          )}

          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-1.5 rounded-lg text-text-secondary hover:text-error hover:bg-surface-hover transition-colors"
            title="Delete project"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Project"
        description="Are you sure you want to delete this project? This will remove all associated stream records."
      >
        <div className="space-y-4 pt-2">
          <div className="p-3 bg-surface-hover rounded-xl border border-border text-xs text-text-primary font-medium truncate">
            {project.title}
          </div>
          <div className="flex justify-end gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              isLoading={isDeleting}
            >
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
