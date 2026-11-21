"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from "recharts";
import { SignalWindow, Moment } from "@/types";
import { formatDuration } from "@/lib/utils";

interface MomentsTimelineChartProps {
  signals: SignalWindow[];
  moments: Moment[];
  selectedMomentId?: string | null;
  onSeek: (seconds: number) => void;
}

export function MomentsTimelineChart({
  signals,
  moments,
  selectedMomentId,
  onSeek,
}: MomentsTimelineChartProps) {
  if (!signals || signals.length === 0) {
    return null;
  }

  // Format data points for Recharts
  const chartData = signals.map((s) => ({
    time: s.start_sec,
    funny: Number((s.funny_score * 100).toFixed(1)),
    sad: Number((s.sad_score * 100).toFixed(1)),
  }));

  const handleChartClick = (e: any) => {
    if (e && e.activePayload && e.activePayload[0]) {
      const clickedTime = e.activePayload[0].payload.time;
      if (typeof clickedTime === "number") {
        onSeek(clickedTime);
      }
    }
  };

  const selectedMoment = moments.find((m) => m.id === selectedMomentId);

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Moment Detection Signal Timeline
          </h4>
          <p className="text-[11px] text-text-secondary">
            Click anywhere on the chart to seek the video player
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed]" />
            <span className="text-text-secondary">Funny Score</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#06b6d4]" />
            <span className="text-text-secondary">Sad Score</span>
          </div>
        </div>
      </div>

      <div className="h-44 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            onClick={handleChartClick}
            margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
          >
            <defs>
              <linearGradient id="funnyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="sadGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="time"
              tickFormatter={(val) => formatDuration(val)}
              stroke="#9da0b5"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: "#262638" }}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#9da0b5"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const dataPoint = payload[0].payload;
                  return (
                    <div className="bg-surface/95 backdrop-blur-md border border-border p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                      <p className="font-mono font-semibold text-text-primary">
                        Time: {formatDuration(dataPoint.time)}
                      </p>
                      <p className="text-[#bf94ff] font-medium">
                        Funny Score: {dataPoint.funny}%
                      </p>
                      <p className="text-[#67e8f9] font-medium">
                        Sad Score: {dataPoint.sad}%
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Highlight area of selected moment */}
            {selectedMoment && (
              <ReferenceArea
                x1={selectedMoment.start_sec}
                x2={selectedMoment.end_sec}
                stroke="#7c3aed"
                strokeOpacity={0.8}
                fill="#7c3aed"
                fillOpacity={0.2}
              />
            )}

            <Area
              type="monotone"
              dataKey="funny"
              stroke="#7c3aed"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#funnyGradient)"
            />
            <Area
              type="monotone"
              dataKey="sad"
              stroke="#06b6d4"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#sadGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
