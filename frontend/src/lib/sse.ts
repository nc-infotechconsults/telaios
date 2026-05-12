import { useEffect, useRef, useCallback } from "react";
import type { WsEvent } from "../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const TOKEN_KEY = "swe_auth_token";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function usePlanSSE(
  planId: string | undefined,
  onEvent: (event: WsEvent) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const sendMessage = useCallback(
    async (content: string) => {
      if (DEMO || !planId) return;
      const res = await fetch(`/api/chat/${planId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
    },
    [planId]
  );

  useEffect(() => {
    if (DEMO || !planId) return;

    const controller = new AbortController();
    const decoder = new TextDecoder();
    let buffer = "";

    async function connect() {
      try {
        const res = await fetch(`/api/chat/${planId}/stream`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE returned ${res.status}`);
        const reader = res.body.getReader();
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            try {
              onEventRef.current(JSON.parse(data) as WsEvent);
            } catch {
              // ignore non-JSON frames
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error("SSE error", err);
      }
    }

    void connect();

    return () => {
      controller.abort();
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
