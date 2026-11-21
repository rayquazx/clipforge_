"use client";

import * as React from "react";
import { UploadCloud, FileVideo, X, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useToast } from "@/components/ui/Toast";
import api from "@/lib/api";
import { formatFileSize } from "@/lib/utils";

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function FileUploadModal({
  isOpen,
  onClose,
  onSuccess,
}: FileUploadModalProps) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const resetState = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setIsUploading(false);
    setError(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setError(null);
    const validExtensions = [".mp4", ".mov", ".mkv", ".webm"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      setError("Please upload an MP4, MOV, MKV, or WEBM video file.");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setError("File exceeds the 500MB maximum upload limit.");
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      await api.post("/projects/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percent);
          }
        },
      });

      toast.success("Video uploaded successfully!");
      resetState();
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Upload failed. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isUploading) {
          resetState();
          onClose();
        }
      }}
      title="Upload Video File"
      description="Upload an MP4, MOV, MKV, or WEBM stream recording up to 500MB"
    >
      <div className="space-y-4 pt-2">
        {/* Drop zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
            dragActive
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 bg-surface/50 hover:bg-surface-hover/50"
          } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.mkv,.webm"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center text-primary mb-3">
            <UploadCloud className="w-6 h-6" />
          </div>

          <p className="text-sm font-medium text-text-primary">
            Drag & drop your video file here, or{" "}
            <span className="text-primary hover:underline">browse</span>
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Supported: MP4, MOV, MKV, WEBM (Max 500MB)
          </p>
        </div>

        {/* Selected file preview */}
        {selectedFile && (
          <div className="flex items-center justify-between p-3.5 bg-surface-hover rounded-xl border border-border">
            <div className="flex items-center gap-3 min-w-0">
              <FileVideo className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">
                  {selectedFile.name}
                </p>
                <p className="text-[11px] text-text-secondary">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            {!isUploading && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
                className="text-text-secondary hover:text-text-primary p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Upload progress */}
        {isUploading && (
          <div className="space-y-1.5 pt-1">
            <ProgressBar progress={uploadProgress} showLabel />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2.5 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetState();
              onClose();
            }}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            isLoading={isUploading}
          >
            Upload & Process
          </Button>
        </div>
      </div>
    </Modal>
  );
}
