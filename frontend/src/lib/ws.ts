import { useEffect, useRef, useCallback } from "react";
import type { WsEvent } from "../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

export function useProjectWebSocket(
  projectId: string | undefined,
  onEvent: (event: WsEvent) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // In demo mode the WebSocket is a no-op — all data is pre-loaded from mock API.
  const sendMessage = useCallback((_content: string) => {
    if (DEMO) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "user_message", content: _content }));
    }
  }, []);

  useEffect(() => {
    if (DEMO || !projectId) return;

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
