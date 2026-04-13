import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";

import { config } from "@/core/config";
import { errorHandler } from "@/core/errors";
import { FileWatcherService } from "@/services/fileWatcher.service";
import { ContainerService } from "@/services/container.service";
import { agentService } from "@/services/agent.service";

import workspaceRoutes from "@/routes/workspace";
import containerRoutes from "@/routes/container";
import gitRoutes from "@/routes/git";
import dbRoutes from "@/routes/db";
import agentRoutes from "@/routes/agent";

// ── WebSocket setup ───────────────────────────────────────────────────────────
//
// IMPORTANT: do NOT write to ws.raw.data — Hono stores its internal
// { events } object there during upgrade; overwriting it causes the
// "undefined is not an object (evaluating 'websocketListeners.onMessage')"
// crash.  All per-connection state lives in closures instead.

const { upgradeWebSocket, websocket } = createBunWebSocket();

// File-watcher broadcast: workspaceId → set of raw Bun WS handles
const workspaceSockets = new Map<string, Set<ServerWebSocket<unknown>>>();

function addSocket(workspaceId: string, ws: ServerWebSocket<unknown>) {
  if (!workspaceSockets.has(workspaceId)) {
    workspaceSockets.set(workspaceId, new Set());
  }
  workspaceSockets.get(workspaceId)!.add(ws);
}

function removeSocket(workspaceId: string, ws: ServerWebSocket<unknown>) {
  workspaceSockets.get(workspaceId)?.delete(ws);
}

function broadcast(workspaceId: string, msg: unknown) {
  const sockets = workspaceSockets.get(workspaceId);
  if (!sockets) return;
  const payload = JSON.stringify(msg);
  for (const ws of sockets) {
    try {
      ws.send(payload);
    } catch {
      // disconnected — cleaned up on close
    }
  }
}

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// ── REST routes ───────────────────────────────────────────────────────────────

app.route("/api/workspaces", workspaceRoutes);
app.route("/api/containers", containerRoutes);
app.route("/api/git", gitRoutes);
app.route("/api/db", dbRoutes);
app.route("/api/agent", agentRoutes);

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({
    status: "ok",
    containers: config.DISABLE_CONTAINERS ? "disabled" : "enabled",
    uptime: process.uptime(),
  }),
);

// ── File-watcher WebSocket ────────────────────────────────────────────────────
// ws://localhost:4000/ws/:workspaceId

app.get(
  "/ws/:workspaceId",
  upgradeWebSocket((c) => {
    const workspaceId = c.req.param("workspaceId")!;
    const sessionId = crypto.randomUUID();

    const unsubscribe = FileWatcherService.subscribe(
      workspaceId,
      (event) => {
        broadcast(workspaceId, {
          type: `file:${event.type}`,
          workspaceId,
          payload: { path: event.path, oldPath: event.oldPath },
        });
      },
    );

    return {
      onOpen(_evt, ws) {
        // Store the raw handle for broadcasting — do NOT assign ws.raw.data
        addSocket(workspaceId, ws.raw as ServerWebSocket<unknown>);
        ContainerService.heartbeat(workspaceId);
        ws.send(JSON.stringify({ type: "pong", payload: { sessionId } }));
      },

      onMessage(evt, ws) {
        try {
          const msg = JSON.parse(String(evt.data));
          if (msg.type === "ping") {
            ContainerService.heartbeat(workspaceId);
            ws.send(JSON.stringify({ type: "pong", payload: {} }));
          }
        } catch {
          // ignore malformed messages
        }
      },

      onClose(_evt, ws) {
        removeSocket(workspaceId, ws.raw as ServerWebSocket<unknown>);
        if (!workspaceSockets.get(workspaceId)?.size) {
          unsubscribe();
        }
      },

      onError(_evt, ws) {
        removeSocket(workspaceId, ws.raw as ServerWebSocket<unknown>);
      },
    };
  }),
);

// ── Terminal WebSocket ────────────────────────────────────────────────────────
// ws://localhost:4000/ws/:workspaceId/terminal?cols=220&rows=50

app.get(
  "/ws/:workspaceId/terminal",
  upgradeWebSocket((c) => {
    const workspaceId = c.req.param("workspaceId")!;
    const cols = parseInt(c.req.query("cols") ?? "220", 10);
    const rows = parseInt(c.req.query("rows") ?? "50", 10);

    let stream: NodeJS.ReadWriteStream | null = null;
    let resizeFn: ((cols: number, rows: number) => Promise<void>) | null = null;

    return {
      onOpen(_evt, ws) {
        void (async () => {
          try {
            const result = await ContainerService.exec(workspaceId, { cols, rows });
            stream = result.stream;
            resizeFn = result.resize;

            result.stream.on("data", (chunk: Buffer) => {
              try {
                ws.send(new Uint8Array(chunk));
              } catch {
                // socket already closed
              }
            });

            result.stream.on("end", () => {
              try { ws.close(); } catch { /* ignore */ }
            });

            result.stream.on("error", () => {
              try { ws.close(); } catch { /* ignore */ }
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to start terminal";
            ws.send(`\r\n\x1b[31m${msg}\x1b[0m\r\n`);
            ws.close();
          }
        })();
      },

      onMessage(evt, _ws) {
        if (!stream) return;
        try {
          const msg = JSON.parse(String(evt.data)) as {
            type: string;
            payload: Record<string, unknown>;
          };
          if (msg.type === "terminal:data") {
            stream.write(msg.payload.data as string);
          } else if (msg.type === "terminal:resize" && resizeFn) {
            const { cols: c, rows: r } = msg.payload as { cols: number; rows: number };
            void resizeFn(c, r);
          }
        } catch {
          // not JSON — pass binary input directly
          if (evt.data instanceof ArrayBuffer) {
            stream.write(Buffer.from(evt.data));
          }
        }
      },

      onClose() {
        try { stream?.end(); } catch { /* ignore */ }
        stream = null;
        resizeFn = null;
      },

      onError() {
        try { stream?.end(); } catch { /* ignore */ }
        stream = null;
        resizeFn = null;
      },
    };
  }),
);

// ── Error handler ─────────────────────────────────────────────────────────────

app.onError(errorHandler);

app.notFound((c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404),
);

// ── Bun server export ─────────────────────────────────────────────────────────

console.log(`IDE server starting on port ${config.PORT}…`);

// Initialize agent service in the background (non-blocking).
// Routes return 503 gracefully if OpenCode is not available.
agentService.initialize().catch((err) => {
  console.error("[agent] Unhandled initialization error:", err);
});

export default {
  port: config.PORT,
  fetch: app.fetch,
  websocket,
};
