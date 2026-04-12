import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ws } from "@/lib/ws";
import { useEffect } from "react";
import type { WsMessage } from "@/types";
import { PanelLayout } from "./PanelLayout";

export function IDEShell() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const heartbeat = useWorkspaceStore((s) => s.heartbeat);

  // Connect WebSocket when workspace becomes active
  useEffect(() => {
    if (!activeWorkspace) return;
    ws.connect(activeWorkspace.id);

    const unsub = ws.onMessage((msg: WsMessage) => {
      // File change events could trigger file-tree refresh — handled in explorer
      // Container status changes update workspace status
      if (msg.type === "container:status") {
        // handled downstream
      }
    });

    return () => {
      unsub();
      ws.disconnect();
    };
  }, [activeWorkspace?.id]);

  // Heartbeat every 30s
  useEffect(() => {
    if (!activeWorkspace) return;
    const id = setInterval(() => heartbeat(activeWorkspace.id), 30_000);
    return () => clearInterval(id);
  }, [activeWorkspace?.id]);

  if (!activeWorkspace) return null;

  return <PanelLayout workspaceId={activeWorkspace.id} />;
}
