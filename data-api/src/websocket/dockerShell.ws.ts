/**
 * Docker shell WebSocket handler.
 *
 * Handles WS upgrade requests at:
 *   /ws/environments/:envId/docker/shell/:containerId
 *
 * Auth: JWT token passed as ?token= query param (browsers cannot set
 * custom headers on WebSocket upgrade requests).
 *
 * Protocol:
 *   client → server: raw stdin bytes (or JSON resize: { type:"resize", cols, rows })
 *   server → client: raw stdout/stderr bytes from the container PTY
 */
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";
import Dockerode from "dockerode";
import { AppDataSource } from "../configs/data-source.config";
import { Environment } from "../entities/Environment.entity";
import { decrypt } from "../utils/crypto.util";
import { verifyToken, getUserById } from "../services/auth.service";
import logger from "../utils/logger";
import type { DockerConnectionConfig } from "../services/docker.service";

// Regex that matches /ws/environments/:envId/docker/shell/:containerId
const SHELL_PATH = /^\/ws\/environments\/([^/]+)\/docker\/shell\/([^/?]+)/;

function buildDockerode(cfg: DockerConnectionConfig): Dockerode {
  if (!cfg.host) {
    return new Dockerode();
  }

  if (cfg.host.startsWith("unix://")) {
    const socketPath = cfg.host.replace("unix://", "");
    const engineSocket = socketPath.endsWith("docker-cli.sock")
      ? "/var/run/docker.sock"
      : socketPath;
    return new Dockerode({ socketPath: engineSocket });
  }

  const url = new URL(cfg.host);
  const opts: ConstructorParameters<typeof Dockerode>[0] = {
    host: url.hostname,
    port: parseInt(url.port || "2376", 10),
    protocol: url.protocol.replace(":", "") as "http" | "https" | "ssh",
  };

  if (cfg.tls_cert && cfg.tls_key && cfg.tls_ca) {
    opts.cert = cfg.tls_cert;
    opts.key = cfg.tls_key;
    opts.ca = cfg.tls_ca;
  }

  return new Dockerode(opts);
}

async function resolveDockerConfig(envId: string): Promise<DockerConnectionConfig> {
  const envRepo = AppDataSource.getRepository(Environment);
  const env = await envRepo.findOneBy({ id: envId });
  if (!env) throw Object.assign(new Error("Environment not found"), { status: 404 });
  if (env.type !== "docker") throw Object.assign(new Error("Not a Docker environment"), { status: 400 });
  const raw = decrypt(env.connection_config);
  if (!raw) throw Object.assign(new Error("No connection config"), { status: 500 });
  return JSON.parse(raw) as DockerConnectionConfig;
}

export function attachDockerShellHandler(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const match = SHELL_PATH.exec(reqUrl.pathname);
    if (!match) {
      // Not our path — let other upgrade handlers deal with it (or destroy)
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, match[1], match[2], reqUrl);
    });
  });

  wss.on("connection", async (
    ws: WebSocket,
    req: http.IncomingMessage,
    envId: string,
    containerId: string,
    reqUrl: URL,
  ) => {
    const token = reqUrl.searchParams.get("token") ?? "";

    // ── Auth ──────────────────────────────────────────────────────────────────
    try {
      const payload = verifyToken(token);
      const user = await getUserById(payload.sub);
      if (!user || !user.is_active) {
        ws.close(4001, "Unauthorized");
        return;
      }
    } catch {
      ws.close(4001, "Invalid token");
      return;
    }

    // ── Resolve Docker config ─────────────────────────────────────────────────
    let cfg: DockerConnectionConfig;
    try {
      cfg = await resolveDockerConfig(envId);
    } catch (err) {
      logger.error({ err, envId }, "Failed to resolve docker config for shell");
      ws.close(4000, "Environment error");
      return;
    }

    // ── Start exec (interactive + tty) ────────────────────────────────────────
    const docker = buildDockerode(cfg);
    const container = docker.getContainer(containerId);

    let execStream: NodeJS.ReadWriteStream | null = null;

    try {
      const exec = await container.exec({
        Cmd: ["/bin/sh", "-c", "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi"],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      });

      const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
      execStream = stream;

      // Docker → WebSocket
      stream.on("data", (chunk: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      });

      stream.on("end", () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, "Shell exited");
        }
      });

      stream.on("error", (err: Error) => {
        logger.error({ err }, "Docker shell stream error");
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1011, "Stream error");
        }
      });

      // WebSocket → Docker
      ws.on("message", (data: Buffer | string) => {
        if (!execStream) return;

        // Check for terminal resize message
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
            exec.resize({ w: msg.cols, h: msg.rows }).catch(() => {});
            return;
          }
        } catch {
          // Not JSON — treat as raw stdin
        }

        execStream.write(data);
      });

      ws.on("close", () => {
        if (execStream) {
          (execStream as NodeJS.ReadWriteStream & { destroy?: () => void }).destroy?.();
          execStream = null;
        }
      });

      logger.info({ envId, containerId }, "Docker shell session started");
    } catch (err) {
      logger.error({ err, envId, containerId }, "Failed to start docker shell exec");
      ws.close(4000, "Exec failed");
    }
  });
}
