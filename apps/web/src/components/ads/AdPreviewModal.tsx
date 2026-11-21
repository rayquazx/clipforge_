"use client";

import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import type { AdAsset } from "@/types";
import { apiClient } from "@/lib/api";

interface AdPreviewModalProps {
  asset: AdAsset | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AdPreviewModal({ asset, isOpen, onClose }: AdPreviewModalProps) {
  if (!asset) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={asset.name}
      description={`${asset.kind.toUpperCase()} • ${
        asset.duration_sec ? `${asset.duration_sec}s • ` : ""
      }${asset.width && asset.height ? `${asset.width}x${asset.height} • ` : ""}${asset.status}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="relative aspect-video w-full rounded-xl bg-black overflow-hidden flex items-center justify-center border border-border">
          {asset.kind === "video" ? (
            <video
              src={asset.url || apiClient.getAdAssetPreviewUrl(asset.id)}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          ) : asset.kind === "image" ? (
            <img
              src={asset.url || asset.thumbnail_url || apiClient.getAdAssetPreviewUrl(asset.id)}
              alt={asset.name}
              className="w-full h-full object-contain"
            />
          ) : asset.text_config ? (
            <div
              className="p-6 rounded-lg text-center max-w-md shadow-lg"
              style={{
                fontFamily: asset.text_config.font || "sans-serif",
                fontSize: `${asset.text_config.size || 24}px`,
                color: asset.text_config.color || "#FFFFFF",
                backgroundColor: asset.text_config.bg || "#7C3AED",
                opacity: asset.text_config.bg_opacity ?? 1.0,
                textShadow: asset.text_config.stroke
                  ? `0 0 4px ${asset.text_config.stroke}`
                  : undefined,
              }}
            >
              {asset.text_config.text}
            </div>
          ) : (
            <p className="text-text-secondary text-sm">No preview available</p>
          )}
        </div>

        {/* Metadata display */}
        <div className="flex flex-wrap gap-2 text-xs text-text-secondary pt-2 border-t border-border">
          {asset.tags.map((tag) => (
            <span
              key={tag}
              className="bg-surface px-2.5 py-1 rounded-md border border-border text-text-primary"
            >
              #{tag}
            </span>
          ))}
          {asset.usage_count > 0 && (
            <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-md border border-primary/20 ml-auto">
              Used in {asset.usage_count} clip{asset.usage_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
