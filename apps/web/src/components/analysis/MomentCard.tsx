"use client";

import * as React from "react";
import {
  Play,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  ExternalLink,
  MessageSquareQuote,
  Clock,
} from "lucide-react";
import { Moment } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/utils";

interface MomentCardProps {
  moment: Moment;
  isSelected: boolean;
  isActive: boolean;
  onSelectToggle: (id: string) => void;
  onPlayClick: (startSec: number) => void;
  onTimeChange: (id: string, newStart: number, newEnd: number) => void;
  onRemove: (id: string) => void;
}

export function MomentCard({
  moment,
  isSelected,
  isActive,
  onSelectToggle,
  onPlayClick,
  onTimeChange,
  onRemove,
}: MomentCardProps) {
  const [isEditingTime, setIsEditingTime] = React.useState(false);
  const [startTime, setStartTime] = React.useState(moment.start_sec);
  const [endTime, setEndTime] = React.useState(moment.end_sec);

  const isFunny = moment.category === "funny";
  const confidencePercent = Math.round(moment.score * 100);

  const handleSaveTimes = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTimeChange(moment.id, startTime, endTime);
    setIsEditingTime(false);
  };

  return (
    <Card
      onClick={() => onPlayClick(moment.start_sec)}
      className={`group cursor-pointer transition-all duration-200 p-5 space-y-4 border ${
        isActive
          ? "border-primary bg-primary/5 shadow-xl shadow-primary/10"
          : "border-border bg-surface hover:border-primary/40 hover:bg-surface-hover/60"
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelectToggle(moment.id);
            }}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-background"
          />

          {/* Category Chip */}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isFunny
                ? "bg-[#9146FF]/15 text-[#bf94ff] border-[#9146FF]/30"
                : "bg-[#06b6d4]/15 text-[#67e8f9] border-[#06b6d4]/30"
            }`}
          >
            <span>{isFunny ? "😂 Funny" : "😢 Emotional"}</span>
          </span>

          {/* Score Badge */}
          <span className="text-[11px] font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
            {confidencePercent}% Score
          </span>
        </div>

        {/* Play trigger button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayClick(moment.start_sec);
          }}
          className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
          title="Play from start"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
        </button>
      </div>

      {/* Title & Reason */}
      <div className="space-y-1.5">
        <h4 className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors leading-snug">
          {moment.title}
        </h4>
        <p className="text-xs text-text-secondary flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          <span>{moment.reason}</span>
        </p>
      </div>

      {/* Transcript Excerpt */}
      {moment.transcript_excerpt && (
        <div className="p-3 rounded-xl bg-background/80 border border-border/80 text-xs text-text-secondary flex items-start gap-2">
          <MessageSquareQuote className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="italic line-clamp-2 leading-relaxed">
            &ldquo;{moment.transcript_excerpt}&rdquo;
          </p>
        </div>
      )}

      {/* Timing Bar & Manual Edit */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/80 text-xs">
        {isEditingTime ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2"
          >
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary">Start:</span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={startTime}
                onChange={(e) => setStartTime(Number(e.target.value))}
                className="w-16 h-7 px-1.5 text-xs bg-background border border-border rounded text-text-primary"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary">End:</span>
              <input
                type="number"
                step="0.5"
                min={startTime + 5}
                value={endTime}
                onChange={(e) => setEndTime(Number(e.target.value))}
                className="w-16 h-7 px-1.5 text-xs bg-background border border-border rounded text-text-primary"
              />
            </div>
            <button
              onClick={handleSaveTimes}
              className="p-1 rounded bg-primary text-white hover:bg-primary-hover"
              title="Save time"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-text-primary bg-surface-hover px-2 py-1 rounded border border-border">
              {formatDuration(moment.start_sec)} &mdash; {formatDuration(moment.end_sec)}
            </span>
            <span className="text-[11px] text-text-secondary">
              ({Math.round(moment.end_sec - moment.start_sec)}s clip)
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingTime(true);
              }}
              className="p-1 text-text-secondary hover:text-text-primary rounded hover:bg-surface-hover transition-colors"
              title="Edit clip boundaries"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Card Footer Actions */}
        <div className="flex items-center gap-2">
          {/* Disabled Open in Editor button as specified in prompt */}
          <Button
            size="sm"
            variant="outline"
            disabled
            className="h-7 text-[11px] px-2.5 opacity-50 cursor-not-allowed"
          >
            Open in editor (Coming in Phase 4)
          </Button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(moment.id);
            }}
            className="p-1.5 text-text-secondary hover:text-error hover:bg-surface-hover rounded-lg transition-colors"
            title="Remove moment"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Card>
  );
}
