import type { Response } from "express";

type ProjectId = string;

const clients = new Map<ProjectId, Set<Response>>();

function send(res: Response, event: object): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export const sseManager = {
  register(projectId: ProjectId, res: Response): void {
    if (!clients.has(projectId)) {
      clients.set(projectId, new Set());
    }
    clients.get(projectId)!.add(res);

    res.on("close", () => {
      clients.get(projectId)?.delete(res);
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
