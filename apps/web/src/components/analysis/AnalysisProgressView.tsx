"use client";

import * as React from "react";
import { Loader2, Download, Mic, Sparkles, AlertCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Card } from "@/components/ui/Card";
import { Analysis } from "@/types";
import api from "@/lib/api";

interface AnalysisProgressViewProps {
  analysis: Analysis;
  onCancelled: () => void;
}

export function AnalysisProgressView({
  analysis,
  onCancelled,
}: AnalysisProgressViewProps) {
  const [isCancelling, setIsCancelling] = React.useState(false);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await api.post(`/analyses/${analysis.id}/cancel`);
      onCancelled();
    } catch {
    } finally {
      setIsCancelling(false);
    }
  };

  const getStageIndicator = (targetStage: string) => {
    const stageOrder = ["downloading", "transcribing", "analyzing", "ready"];
    const currentIdx = stageOrder.indexOf(analysis.stage || "queued");
    const targetIdx = stageOrder.indexOf(targetStage);

    if (currentIdx > targetIdx || analysis.status === "ready") {
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    }
    if (currentIdx === targetIdx && analysis.status !== "failed") {
      return "text-primary bg-primary/15 border-primary animate-pulse";
    }
    return "text-text-secondary/40 bg-surface-hover border-border";
  };

  return (
    <Card className="p-6 border-primary/30 bg-surface space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              AI Moment Detection in Progress
            </h3>
            <p className="text-xs text-text-secondary">
              Extracting speech, computing audio energy, and scoring highlights
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isCancelling}
          className="gap-1.5 text-xs text-text-secondary hover:text-error"
        >
          <XCircle className="w-3.5 h-3.5" />
          Cancel
        </Button>
      </div>

      {/* Stage Flow */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${getStageIndicator("downloading")}`}>
          <Download className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-tight">1. Download</p>
            <p className="text-[10px] text-text-secondary truncate">Audio 16kHz</p>
          </div>
        </div>

        <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${getStageIndicator("transcribing")}`}>
          <Mic className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-tight">2. Transcribe</p>
            <p className="text-[10px] text-text-secondary truncate">Whisper AI</p>
          </div>
        </div>

        <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${getStageIndicator("analyzing")}`}>
          <Sparkles className="w-4 h-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-tight">3. Detect</p>
            <p className="text-[10px] text-text-secondary truncate">Signals & Peaks</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="font-medium text-text-secondary capitalize">
            Stage: {analysis.stage || "processing"}...
          </span>
          <span className="font-mono font-semibold text-primary">
            {analysis.progress}%
          </span>
        </div>
        <ProgressBar progress={analysis.progress} />
      </div>

      {/* Error state */}
      {analysis.status === "failed" && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p>{analysis.error_message || "Processing failed unexpectedly."}</p>
        </div>
      )}
    </Card>
  );
}
