import { useEffect, useRef, useCallback } from "react";
import type { WsEvent } from "../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

export function usePlanSSE(
  planId: string | undefined,
  onEvent: (event: WsEvent) => void
) {
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const sendMessage = useCallback(
    async (content: string) => {
      if (DEMO || !planId) return;
      const res = await fetch(`/agent/chat/${planId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`Agent service returned ${res.status}`);
    },
    [planId]
  );

  useEffect(() => {
    if (DEMO || !planId) return;

    const es = new EventSource(`/agent/chat/${planId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WsEvent;
        onEventRef.current(event);
      } catch {
        // ignore non-JSON frames (e.g. keepalive comments)
      }
    };

    es.onerror = (err) => {
      console.error("SSE error", err);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [planId]);

  return { sendMessage };
}

/** @deprecated use usePlanSSE instead */
export function useProjectSSE(
  projectId: string | undefined,
  onEvent: (event: WsEvent) => void
) {
  return usePlanSSE(projectId, onEvent);
}
