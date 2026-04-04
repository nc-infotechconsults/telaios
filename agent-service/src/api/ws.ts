import type { Application } from "express";
import expressWs from "express-ws";
import { wsManager } from "../services/wsManager";
import { handleUserMessage } from "../services/planningService";

export function registerWsRoutes(app: Application & ReturnType<typeof expressWs>["app"]): void {
  app.ws("/ws/:projectId", (ws, req) => {
    const { projectId } = req.params;
    wsManager.register(projectId, ws as unknown as import("ws").WebSocket);

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { content?: string };
        if (msg.content) {
          await handleUserMessage(projectId, msg.content, ws as unknown as import("ws").WebSocket);
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: String(err) }));
      }
    });

    ws.on("error", (err) => {
      console.error(`WS error for project ${projectId}:`, err);
    });
  });
}
