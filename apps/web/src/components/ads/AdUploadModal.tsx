"use client";

import * as React from "react";
import { UploadCloud, File, CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { apiClient, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface AdUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

interface QueuedFile {
  id: string;
  file: File;
  name: string;
  tags: string;
  progress: number;
  status: "pending" | "uploading" | "processing" | "ready" | "error";
  errorMessage?: string;
}

const ALLOWED_EXTENSIONS = ["mp4", "mov", "webm", "png", "jpg", "jpeg", "webp"];
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200MB limit

export function AdUploadModal({
  isOpen,
  onClose,
  onUploaded,
}: AdUploadModalProps) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [queue, setQueue] = React.useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const addFilesToQueue = (files: FileList | File[]) => {
    const newItems: QueuedFile[] = [];

    Array.from(files).forEach((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      let status: QueuedFile["status"] = "pending";
      let errorMessage: string | undefined;

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        status = "error";
        errorMessage = `Unsupported format (${ext}). Allowed: MP4, MOV, WEBM, PNG, JPG, WEBP.`;
      } else if (file.size > MAX_FILE_SIZE_BYTES) {
        status = "error";
        errorMessage = "File exceeds maximum size limit (200MB).";
      }

      newItems.push({
        id: `queue-${Date.now()}-${Math.random()}`,
        file,
        name: file.name.replace(/\.[^/.]+$/, ""),
        tags: "ad, sponsor",
        progress: 0,
        status,
        errorMessage,
      });
    });

    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const startUpload = async () => {
    const pendingItems = queue.filter((item) => item.status === "pending");
    if (pendingItems.length === 0) return;

    setIsSubmitting(true);

    for (const item of pendingItems) {
      // Set to uploading
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "uploading", progress: 40 } : q))
      );

      try {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("name", item.name);
        formData.append("tags", item.tags);

        // Upload to server
        const res = await apiClient.createAdAsset(formData);

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: res.status === "processing" ? "processing" : "ready",
                  progress: 100,
                }
              : q
          )
        );
      } catch (err: any) {
        const message =
          err instanceof ApiError
            ? err.message
            : err.response?.data?.error?.message || "Failed to upload asset";
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: "error", errorMessage: message } : q
          )
        );
      }
    }

    setIsSubmitting(false);
    onUploaded();
    toast.success("Upload queue finished!");
  };

  const canUpload = queue.some((i) => i.status === "pending") && !isSubmitting;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title="Upload Ad Assets"
      description="Upload video (MP4, MOV, WEBM) or image (PNG, JPG, WEBP) ads up to 200MB."
      className="max-w-xl"
    >
      <div className="space-y-5">
        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? "border-primary bg-primary/10 scale-[1.01]"
              : "border-border hover:border-primary/50 bg-surface/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".mp4,.mov,.webm,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFilesToQueue(e.target.files);
            }}
          />
          <div className="w-12 h-12 rounded-2xl bg-surface-hover flex items-center justify-center mx-auto mb-3 text-primary">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-text-primary">
            Click to browse or drag and drop media files
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Max 200MB per file • 1080p recommended
          </p>
        </div>

        {/* Notice */}
        <p className="text-[11px] text-text-secondary bg-surface-hover/60 p-2.5 rounded-xl border border-border">
          ⚠️ <strong>Notice:</strong> Only upload ads, logos, and sponsor graphics that you have
          the full rights or permission to use.
        </p>

        {/* Upload Queue List */}
        {queue.length > 0 && (
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {queue.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-surface border border-border space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <File className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium text-text-primary truncate">
                      {item.file.name}
                    </span>
                    <span className="text-[10px] text-text-secondary">
                      ({(item.file.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "uploading" && (
                      <span className="text-primary flex items-center gap-1 text-[11px]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading
                      </span>
                    )}
                    {item.status === "processing" && (
                      <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing
                      </span>
                    )}
                    {item.status === "ready" && (
                      <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="text-error flex items-center gap-1 text-[11px]" title={item.errorMessage}>
                        <AlertCircle className="w-3.5 h-3.5" /> Error
                      </span>
                    )}
                    {!isSubmitting && (
                      <button
                        onClick={() => removeQueueItem(item.id)}
                        className="text-text-secondary hover:text-text-primary p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {item.status === "error" && item.errorMessage && (
                  <p className="text-[11px] text-error font-medium">{item.errorMessage}</p>
                )}

                {item.status === "uploading" && (
                  <ProgressBar progress={item.progress} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={startUpload}
            disabled={!canUpload}
            isLoading={isSubmitting}
          >
            Upload {queue.filter((i) => i.status === "pending").length} Files
          </Button>
        </div>
      </div>
    </Modal>
  );
}
