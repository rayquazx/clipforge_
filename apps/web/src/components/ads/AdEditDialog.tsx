"use client";

import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { AdAsset } from "@/types";

interface AdEditDialogProps {
  asset: AdAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function AdEditDialog({
  asset,
  isOpen,
  onClose,
  onUpdated,
}: AdEditDialogProps) {
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (asset) {
      setName(asset.name);
      setTags(asset.tags?.join(", ") || "");
    }
  }, [asset]);

  if (!asset) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await apiClient.updateAdAsset(asset.id, {
        name,
        tags: tagList,
      });

      toast.success("Ad details updated!");
      onUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update ad asset.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Ad Asset"
      description={`Update metadata for ${asset.name}`}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Ad Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Input
          label="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="sponsor, pre-roll, discount"
        />

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" type="submit" isLoading={isSubmitting}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
