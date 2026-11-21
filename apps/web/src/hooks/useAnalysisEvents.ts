import { useEffect } from "react";
import { Analysis } from "@/types";
import { getAccessToken } from "@/lib/auth";

interface AnalysisEventsCallbacks {
  onUpdate?: (updated: Partial<Analysis>) => void;
}

export function useAnalysisEvents(
  analysisId: string | null,
  currentStatus: string | undefined,
  callbacks: AnalysisEventsCallbacks
) {
  useEffect(() => {
    if (!analysisId || currentStatus === "ready" || currentStatus === "failed") {
      return;
    }

    const token = getAccessToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const url = `${apiUrl}/events/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(url);

      eventSource.addEventListener("analysis.progress", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.analysis_id === analysisId && callbacks.onUpdate) {
            callbacks.onUpdate(data);
          }
        } catch {}
      });

      eventSource.addEventListener("analysis.ready", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.analysis_id === analysisId && callbacks.onUpdate) {
            callbacks.onUpdate({ status: "ready", progress: 100 });
          }
        } catch {}
      });

      eventSource.addEventListener("analysis.failed", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.analysis_id === analysisId && callbacks.onUpdate) {
            callbacks.onUpdate({ status: "failed", error_message: data.message });
          }
        } catch {}
      });
    } catch {}

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [analysisId, currentStatus, callbacks]);
}
