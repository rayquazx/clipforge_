import { useEffect } from "react";
import { Project } from "@/types";
import { getAccessToken } from "@/lib/auth";

interface ProjectEventsCallbacks {
  onStatusChange?: (updated: Partial<Project>) => void;
}

export function useProjectEvents(
  projectId: string,
  currentStatus: string,
  callbacks: ProjectEventsCallbacks
) {
  useEffect(() => {
    if (currentStatus === "ready" || currentStatus === "failed") {
      return;
    }

    const token = getAccessToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const url = `${apiUrl}/events/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(url);

      eventSource.addEventListener("project.status", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.project_id === projectId && callbacks.onStatusChange) {
            callbacks.onStatusChange(data);
          }
        } catch {}
      });
    } catch {}

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [projectId, currentStatus, callbacks]);
}
