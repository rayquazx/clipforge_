"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/auth";
import type {
  PreviewProgressEvent,
  PreviewReadyEvent,
  PreviewFailedEvent,
  RenderProgressEvent,
  RenderReadyEvent,
  RenderFailedEvent,
  RenderCancelledEvent,
} from "@/types";

export interface EventStreamCallbacks {
  onPreviewProgress?: (data: PreviewProgressEvent) => void;
  onPreviewReady?: (data: PreviewReadyEvent) => void;
  onPreviewFailed?: (data: PreviewFailedEvent) => void;
  onRenderProgress?: (data: RenderProgressEvent) => void;
  onRenderReady?: (data: RenderReadyEvent) => void;
  onRenderFailed?: (data: RenderFailedEvent) => void;
  onRenderCancelled?: (data: RenderCancelledEvent) => void;
}

export function useEventStream(
  clipId?: string | null,
  callbacks?: EventStreamCallbacks,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let isUnmounted = false;

    // Helper: start 3s polling fallback
    const startPollingFallback = () => {
      if (pollingIntervalRef.current) return;
      pollingIntervalRef.current = setInterval(() => {
        if (clipId) {
          queryClient.invalidateQueries({ queryKey: ["preview-status", clipId] });
          queryClient.invalidateQueries({ queryKey: ["clip-renders", clipId] });
          queryClient.invalidateQueries({ queryKey: ["clip", clipId] });
        }
        queryClient.invalidateQueries({ queryKey: ["clips"] });
      }, 3000);
    };

    // Helper: stop polling fallback
    const stopPollingFallback = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };

    const connectSSE = () => {
      if (isUnmounted) return;

      const token = getAccessToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const params = new URLSearchParams();
      if (clipId) params.append("clip_id", clipId);
      if (token) params.append("token", token);

      const url = `${baseUrl}/events/stream?${params.toString()}`;

      try {
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.onopen = () => {
          reconnectAttemptsRef.current = 0;
          stopPollingFallback();
        };

        es.onerror = () => {
          es.close();
          eventSourceRef.current = null;

          // Start polling while disconnected
          startPollingFallback();

          // Exponential backoff reconnect
          if (!isUnmounted) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
            reconnectAttemptsRef.current += 1;
            reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
          }
        };

        // Listen for contract events
        es.addEventListener("preview.progress", (e) => {
          try {
            const data: PreviewProgressEvent = JSON.parse(e.data);
            if (!clipId || data.clip_id === clipId) {
              queryClient.invalidateQueries({ queryKey: ["preview-status", data.clip_id] });
              callbacksRef.current?.onPreviewProgress?.(data);
            }
          } catch {}
        });

        es.addEventListener("preview.ready", (e) => {
          try {
            const data: PreviewReadyEvent = JSON.parse(e.data);
            if (!clipId || data.clip_id === clipId) {
              queryClient.invalidateQueries({ queryKey: ["preview-status", data.clip_id] });
              queryClient.invalidateQueries({ queryKey: ["clip", data.clip_id] });
              queryClient.invalidateQueries({ queryKey: ["clips"] });
              callbacksRef.current?.onPreviewReady?.(data);
            }
          } catch {}
        });

        es.addEventListener("preview.failed", (e) => {
          try {
            const data: PreviewFailedEvent = JSON.parse(e.data);
            if (!clipId || data.clip_id === clipId) {
              queryClient.invalidateQueries({ queryKey: ["preview-status", data.clip_id] });
              callbacksRef.current?.onPreviewFailed?.(data);
            }
          } catch {}
        });

        es.addEventListener("render.progress", (e) => {
          try {
            const data: RenderProgressEvent = JSON.parse(e.data);
            if (!clipId || data.clip_id === clipId) {
              queryClient.invalidateQueries({ queryKey: ["render", data.render_id] });
              queryClient.invalidateQueries({ queryKey: ["clip-renders", data.clip_id] });
              callbacksRef.current?.onRenderProgress?.(data);
            }
          } catch {}
        });

        es.addEventListener("render.ready", (e) => {
          try {
            const data: RenderReadyEvent = JSON.parse(e.data);
            if (!clipId || data.clip_id === clipId) {
              queryClient.invalidateQueries({ queryKey: ["render", data.render_id] });
              queryClient.invalidateQueries({ queryKey: ["clip-renders", data.clip_id] });
              queryClient.invalidateQueries({ queryKey: ["clip", data.clip_id] });
              queryClient.invalidateQueries({ queryKey: ["clips"] });
              callbacksRef.current?.onRenderReady?.(data);
            }
          } catch {}
        });

        es.addEventListener("render.failed", (e) => {
          try {
            const data: RenderFailedEvent = JSON.parse(e.data);
            if (!clipId || data.clip_id === clipId) {
              queryClient.invalidateQueries({ queryKey: ["render", data.render_id] });
              queryClient.invalidateQueries({ queryKey: ["clip-renders", data.clip_id] });
              callbacksRef.current?.onRenderFailed?.(data);
            }
          } catch {}
        });

        es.addEventListener("render.cancelled", (e) => {
          try {
            const data: RenderCancelledEvent = JSON.parse(e.data);
            if (!clipId || data.clip_id === clipId) {
              queryClient.invalidateQueries({ queryKey: ["render", data.render_id] });
              queryClient.invalidateQueries({ queryKey: ["clip-renders", data.clip_id] });
              callbacksRef.current?.onRenderCancelled?.(data);
            }
          } catch {}
        });
      } catch (err) {
        startPollingFallback();
      }
    };

    connectSSE();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      stopPollingFallback();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [clipId, enabled, queryClient]);
}
