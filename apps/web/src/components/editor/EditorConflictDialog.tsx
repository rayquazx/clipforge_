"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useEditorStore } from "@/stores/editor-store";

export function EditorConflictDialog() {
  const conflictClip = useEditorStore((s) => s.conflictClip);
  const resolveConflict = useEditorStore((s) => s.resolveConflict);

  if (!conflictClip) return null;

  return (
    <Modal
      isOpen={!!conflictClip}
      onClose={() => {}}
      title="Conflict Detected"
      className="max-w-md"
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-text-primary">
              This clip was changed elsewhere
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Another session or automated process updated this clip to version {conflictClip.version}.
              Please reload to fetch the latest state and avoid overwriting newer changes.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button
            size="sm"
            onClick={() => resolveConflict(conflictClip)}
            className="gap-2 font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Latest Version
          </Button>
        </div>
      </div>
    </Modal>
  );
}
