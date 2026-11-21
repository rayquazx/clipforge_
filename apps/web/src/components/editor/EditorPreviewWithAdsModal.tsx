"use client";

import * as React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Loader2, Download, CheckCircle2, Film } from "lucide-react";
import type { Render } from "@/types";

interface EditorPreviewWithAdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  render: Render | null;
  isLoading: boolean;
}

export function EditorPreviewWithAdsModal({
  isOpen,
  onClose,
  render,
  isLoading,
}: EditorPreviewWithAdsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="360p Preview with Ads"
      description="Quick preview showing burned-in overlays, pre-roll/post-roll transitions, and normalized audio."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden flex items-center justify-center border border-border">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-text-secondary">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs font-medium">Generating 360p composition with ads...</p>
            </div>
          ) : render ? (
            <video
              src="/mock/sample.mp4"
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          ) : (
            <p className="text-xs text-text-secondary">No render data available</p>
          )}
        </div>

        <div className="p-3 rounded-xl bg-surface-hover/70 border border-border text-xs text-text-secondary">
          💡 <strong>Note:</strong> This quick preview reflects the exact layout, timing shifts,
          and sound mixing that will appear in your final 1080p/4K export.
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
