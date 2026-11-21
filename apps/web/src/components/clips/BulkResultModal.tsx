"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { BulkActionResponse } from "@/types";

interface BulkResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: BulkActionResponse | null;
  action: "export" | "delete";
}

export function BulkResultModal({
  isOpen,
  onClose,
  result,
  action,
}: BulkResultModalProps) {
  if (!result) return null;

  const acceptedCount = result.accepted?.length || 0;
  const skippedItems = result.skipped || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={action === "export" ? "Bulk Export Result" : "Bulk Delete Result"}
      className="max-w-md"
    >
      <div className="space-y-4">
        {/* Accepted Count */}
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-400 font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            Successfully {action === "export" ? "queued for export" : "deleted"} {acceptedCount} clip
            {acceptedCount === 1 ? "" : "s"}.
          </span>
        </div>

        {/* Skipped Items (Partial Failures) */}
        {skippedItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{skippedItems.length} clip{skippedItems.length === 1 ? "" : "s"} were skipped:</span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-background border border-border text-xs">
              {skippedItems.map((item, idx) => (
                <div key={idx} className="p-2 rounded-lg bg-surface border border-border/60 space-y-0.5">
                  <span className="font-mono text-[10px] text-text-secondary block truncate">
                    ID: {item.id}
                  </span>
                  <span className="text-text-primary text-[11px] block">{item.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-border">
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
