"use client";

import * as React from "react";
import { Sparkles, Sliders, Globe, Clock, Layers } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface AnalyzePanelProps {
  onStartAnalysis: (params: {
    mode: string;
    min_clip_seconds: number;
    max_clip_seconds: number;
    max_clips: number;
    language: string;
  }) => Promise<void>;
  isLoading: boolean;
}

export function AnalyzePanel({ onStartAnalysis, isLoading }: AnalyzePanelProps) {
  const [mode, setMode] = React.useState<"funny" | "sad" | "both">("both");
  const [minClipSec, setMinClipSec] = React.useState(15);
  const [maxClipSec, setMaxClipSec] = React.useState(60);
  const [maxClips, setMaxClips] = React.useState(10);
  const [language, setLanguage] = React.useState("auto");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onStartAnalysis({
      mode,
      min_clip_seconds: minClipSec,
      max_clip_seconds: maxClipSec,
      max_clips: maxClips,
      language,
    });
  };

  return (
    <Card className="p-6 border-border bg-surface">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Moment Detection Settings
          </h3>
          <p className="text-xs text-text-secondary mt-1">
            Choose what type of highlights to detect, clip durations, and target language
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 1. Mode Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-text-secondary">
              Detection Mode
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-background rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setMode("funny")}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "funny"
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                😂 Funny
              </button>
              <button
                type="button"
                onClick={() => setMode("sad")}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "sad"
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                😢 Sad
              </button>
              <button
                type="button"
                onClick={() => setMode("both")}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "both"
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Both
              </button>
            </div>
          </div>

          {/* 2. Clip Length Range Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-text-secondary flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Clip Length
              </span>
              <span className="font-mono font-semibold text-text-primary">
                {minClipSec}s - {maxClipSec}s
              </span>
            </div>
            <div className="space-y-1.5 pt-1">
              <input
                type="range"
                min={10}
                max={120}
                step={5}
                value={maxClipSec}
                onChange={(e) => setMaxClipSec(Number(e.target.value))}
                className="w-full h-1.5 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-text-secondary">
                <span>Min: 15s</span>
                <span>Max: {maxClipSec}s</span>
              </div>
            </div>
          </div>

          {/* 3. Max Clips Target */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-text-secondary flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              Clip Count Target
            </label>
            <select
              value={maxClips}
              onChange={(e) => setMaxClips(Number(e.target.value))}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl text-text-primary focus-ring"
            >
              <option value={5}>Top 5 Moments</option>
              <option value={10}>Top 10 Moments</option>
              <option value={15}>Top 15 Moments</option>
              <option value={20}>Top 20 Moments</option>
            </select>
          </div>

          {/* 4. Language Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-text-secondary flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              Spoken Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full h-10 px-3 text-sm bg-background border border-border rounded-xl text-text-primary focus-ring"
            >
              <option value="auto">Auto-detect Language</option>
              <option value="en">English</option>
              <option value="es">Spanish (Español)</option>
              <option value="de">German (Deutsch)</option>
              <option value="fr">French (Français)</option>
              <option value="pt">Portuguese (Português)</option>
              <option value="ja">Japanese (日本語)</option>
              <option value="ko">Korean (한국어)</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button type="submit" size="md" isLoading={isLoading} className="gap-2 px-6">
            <Sparkles className="w-4 h-4" />
            Start AI Detection
          </Button>
        </div>
      </form>
    </Card>
  );
}
