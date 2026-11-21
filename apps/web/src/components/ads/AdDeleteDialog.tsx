"use client";

import * as React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiClient, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { AdAsset } from "@/types";

interface AdDeleteDialogProps {
  asset: AdAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function AdDeleteDialog({
  asset,
  isOpen,
  onClose,
  onDeleted,
}: AdDeleteDialogProps) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [inUseError, setInUseError] = React.useState<{ clipCount: number } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setInUseError(null);
    }
  }, [isOpen]);

  if (!asset) return null;

  const handleDelete = async (force = false) => {
    setIsDeleting(true);
    try {
      await apiClient.deleteAdAsset(asset.id, force);
      toast.success("Ad asset deleted successfully");
      onDeleted();
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError && err.code === "in_use") {
        const count = err.details?.clip_count ?? asset.usage_count ?? 1;
        setInUseError({ clipCount: count });
      } else {
        toast.error(err.message || "Failed to delete ad asset");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Ad Asset"
      description={`Are you sure you want to delete "${asset.name}"?`}
      className="max-w-md"
    >
      <div className="space-y-4">
        {inUseError ? (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Asset in Use</span>
            </div>
            <p>
              This ad asset is currently referenced by{" "}
              <strong>{inUseError.clipCount}</strong> clip
              {inUseError.clipCount === 1 ? "" : "s"}.
            </p>
            <p className="text-[11px] text-text-secondary">
              Deleting it anyway will automatically remove its placement from those clips.
            </p>
          </div>
        ) : (
          <p className="text-xs text-text-secondary">
            This action cannot be undone. The file and its placements will be permanently
            removed.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          {inUseError ? (
            <Button
              variant="outline"
              size="sm"
              className="border-error/40 text-error hover:bg-error/10"
              onClick={() => handleDelete(true)}
              isLoading={isDeleting}
            >
              Delete anyway (removes it from those clips)
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="border-error/40 text-error hover:bg-error/10"
              onClick={() => handleDelete(false)}
              isLoading={isDeleting}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Ad
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
