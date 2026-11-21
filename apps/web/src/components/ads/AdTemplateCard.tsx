"use client";

import * as React from "react";
import { LayoutTemplate, Edit2, Trash2, Layers } from "lucide-react";
import type { AdTemplate } from "@/types";
import { formatTemplateSummary } from "@/lib/ad-math";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface AdTemplateCardProps {
  template: AdTemplate;
  onEdit: (template: AdTemplate) => void;
  onDelete: (template: AdTemplate) => void;
}

export function AdTemplateCard({
  template,
  onEdit,
  onDelete,
}: AdTemplateCardProps) {
  const summaryText = formatTemplateSummary(template.placements);

  return (
    <div className="rounded-2xl bg-surface border border-border hover:border-primary/40 transition-all duration-200 p-5 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md hover:shadow-primary/5">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary leading-tight">
                {template.name}
              </h3>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {template.placements.length} placement{template.placements.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <Badge variant="default" className="text-[10px]">
            Used {template.usage_count} times
          </Badge>
        </div>

        {/* Visual summary of placements */}
        <div className="p-3 rounded-xl bg-surface-hover/70 border border-border text-xs text-text-secondary flex items-start gap-2">
          <Layers className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <span className="font-medium text-text-primary leading-relaxed">{summaryText}</span>
        </div>
      </div>

      <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(template)}
          className="h-8 px-2.5 text-xs gap-1.5"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(template)}
          className="h-8 px-2.5 text-xs gap-1.5 border-error/30 text-error hover:bg-error/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
