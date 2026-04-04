import type { WebSocket } from "ws";

type ProjectId = string;

const connections = new Map<ProjectId, Set<WebSocket>>();

export const wsManager = {
  register(projectId: ProjectId, ws: WebSocket): void {
    if (!connections.has(projectId)) {
      connections.set(projectId, new Set());
    }
    connections.get(projectId)!.add(ws);

    ws.on("close", () => {
      connections.get(projectId)?.delete(ws);
    });
  },

  broadcast(projectId: ProjectId, event: object): void {
    const sockets = connections.get(projectId);
    if (!sockets) return;
    const msg = JSON.stringify(event);
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  },

  broadcastAll(event: object): void {
    const msg = JSON.stringify(event);
    for (const sockets of connections.values()) {
      for (const ws of sockets) {
        if (ws.readyState === ws.OPEN) {
          ws.send(msg);
        }
      }
    }
  },
};
