import type { Response } from "express";

type ProjectId = string;

const clients = new Map<ProjectId, Set<Response>>();

function pruneEmpty(projectId: ProjectId): void {
  if (clients.get(projectId)?.size === 0) {
    clients.delete(projectId);
  }
}

function send(res: Response, event: object): void {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    // Connection dropped — will be cleaned up on the 'close' event
  }
}

export const sseManager = {
  register(projectId: ProjectId, res: Response): void {
    if (!clients.has(projectId)) {
      clients.set(projectId, new Set());
    }
    clients.get(projectId)!.add(res);

    // Per-client heartbeat comment every 30 s keeps the connection alive
    // through proxies and load balancers.
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        // Write failed — clean up eagerly rather than waiting for 'close'
        clearInterval(heartbeat);
        clients.get(projectId)?.delete(res);
        pruneEmpty(projectId);
      }
    }, 30_000);

    res.on("close", () => {
      clearInterval(heartbeat);
      clients.get(projectId)?.delete(res);
      pruneEmpty(projectId);
    });
  },

  broadcast(projectId: ProjectId, event: object): void {
    const projectClients = clients.get(projectId);
    if (!projectClients) return;
    for (const res of projectClients) {
      send(res, event);
    }
  },

  broadcastAll(event: object): void {
    for (const projectClients of clients.values()) {
      for (const res of projectClients) {
        send(res, event);
      }
    }
  },
};
