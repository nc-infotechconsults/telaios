import { useEffect, useRef, useCallback } from "react";
import type { WsEvent } from "../types";

export function useProjectWebSocket(
  projectId: string | undefined,
  onEvent: (event: WsEvent) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "user_message", content }));
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/${projectId}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WsEvent;
        onEventRef.current(event);
      } catch {
        // ignore non-JSON frames
      }
    };

    ws.onerror = (err) => console.error("WebSocket error", err);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId]);

  return { sendMessage };
}
