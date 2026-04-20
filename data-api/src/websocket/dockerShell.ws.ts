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
 *
 * Implementation note:
 *   Dockerode's exec.start({ hijack: true }) relies on Node.js socket-hijacking
 *   which does not work in Bun's HTTP client.  Instead, we create the exec
 *   entry via Dockerode (a normal HTTP POST that works fine), then open a *raw*
 *   net.Socket / tls.TLSSocket directly to the Docker daemon and send the
 *   POST /exec/{id}/start request manually with Connection: Upgrade / Upgrade: tcp
 *   headers so Docker responds with HTTP 101 and a raw TCP stream.  This
 *   bypasses Bun's HTTP client entirely for the streaming portion.
 */
import http from "http";
import net from "net";
import tls from "tls";
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

/**
 * Open a raw TCP/Unix socket directly to the Docker daemon.
 * Resolves once the socket is connected and ready to write.
 */
function openDockerSocket(cfg: DockerConnectionConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const attach = (s: net.Socket | tls.TLSSocket): void => {
      s.removeListener("error", reject);
      resolve(s);
    };

    if (!cfg.host || cfg.host.startsWith("unix://")) {
      const raw = cfg.host?.replace("unix://", "") ?? "";
      const socketPath =
        !cfg.host || raw.endsWith("docker-cli.sock")
          ? "/var/run/docker.sock"
          : raw;
      const s = net.createConnection({ path: socketPath });
      s.once("connect", () => attach(s));
      s.once("error", reject);
      return;
    }

    const url = new URL(cfg.host);
    const port = parseInt(url.port || "2376", 10);
    const host = url.hostname;

    if (cfg.tls_cert && cfg.tls_key && cfg.tls_ca) {
      const s = tls.connect({ host, port, cert: cfg.tls_cert, key: cfg.tls_key, ca: cfg.tls_ca });
      s.once("secureConnect", () => attach(s));
      s.once("error", reject);
    } else {
      const s = net.createConnection({ host, port });
      s.once("connect", () => attach(s));
      s.once("error", reject);
    }
  });
}

/**
 * POST /exec/{execId}/start over the already-connected raw socket using
 * Connection: Upgrade / Upgrade: tcp so Docker responds with HTTP 101 and
 * transitions the connection to a raw bidirectional PTY stream.
 *
 * Returns any bytes that were already received after the response headers
 * (i.e. the first chunk of PTY output that arrived in the same TCP segment).
 */
function startExecStream(
  socket: net.Socket | tls.TLSSocket,
  execId: string,
): Promise<Buffer> {
  const body = JSON.stringify({ Detach: false, Tty: true });
  const request = [
    `POST /exec/${execId}/start HTTP/1.1`,
    `Host: localhost`,
    `Content-Type: application/json`,
    `Content-Length: ${Buffer.byteLength(body)}`,
    `Connection: Upgrade`,
    `Upgrade: tcp`,
    "",
    body,
  ].join("\r\n");

  socket.write(request);

  return new Promise<Buffer>((resolve, reject) => {
    let buf = Buffer.alloc(0);

    const onError = (err: Error): void => {
      socket.removeListener("data", onData);
      reject(err);
    };

    const onData = (chunk: Buffer): void => {
      buf = Buffer.concat([buf, chunk]);
      const sep = buf.indexOf(Buffer.from("\r\n\r\n"));
      if (sep === -1) return; // headers not complete yet — wait for more data

      const statusLine = buf.subarray(0, buf.indexOf(Buffer.from("\r\n"))).toString();
      const statusCode = parseInt(statusLine.split(" ")[1] ?? "0", 10);

      // Remove listeners before resolving so the caller can add permanent ones
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);

      if (statusCode === 101 || statusCode === 200) {
        // Return any PTY bytes that arrived in the same chunk as the headers
        resolve(buf.subarray(sep + 4));
      } else {
        reject(new Error(`Docker exec/start returned unexpected status ${statusCode}: ${statusLine}`));
      }
    };

    socket.on("data", onData);
    socket.once("error", onError);
  });
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

    // ── Create exec entry (simple HTTP POST — works fine in Bun) ─────────────
    const docker = buildDockerode(cfg);
    const container = docker.getContainer(containerId);

    let exec: Dockerode.Exec;
    try {
      exec = await container.exec({
        Cmd: ["/bin/sh", "-c", "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi"],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      });
    } catch (err) {
      logger.error({ err, envId, containerId }, "Failed to create docker exec");
      ws.close(4000, "Exec create failed");
      return;
    }

    // ── Open raw socket → POST /exec/{id}/start ───────────────────────────────
    // Bypasses Bun's HTTP client (which doesn't support socket hijacking).
    let rawSocket: net.Socket | tls.TLSSocket;
    try {
      rawSocket = await openDockerSocket(cfg);
      const execId = (exec as unknown as { id: string }).id;
      const leftover = await startExecStream(rawSocket, execId);

      // Forward any PTY bytes that arrived alongside the 101/200 headers
      if (leftover.length > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(leftover);
      }
    } catch (err) {
      logger.error({ err, envId, containerId }, "Failed to start docker exec stream");
      ws.close(4000, "Exec start failed");
      return;
    }

    // ── Docker → WebSocket ────────────────────────────────────────────────────
    rawSocket.on("data", (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    });

    rawSocket.on("end", () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Shell exited");
      }
    });

    rawSocket.on("error", (err: Error) => {
      logger.error({ err }, "Docker shell raw socket error");
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, "Stream error");
      }
    });

    // ── WebSocket → Docker ────────────────────────────────────────────────────
    ws.on("message", (data: Buffer | string) => {
      // Check for terminal resize message
      try {
        const msg = JSON.parse(data.toString()) as unknown;
        if (
          typeof msg === "object" && msg !== null &&
          (msg as Record<string, unknown>).type === "resize" &&
          typeof (msg as Record<string, unknown>).cols === "number" &&
          typeof (msg as Record<string, unknown>).rows === "number"
        ) {
          const { cols, rows } = msg as { cols: number; rows: number };
          exec.resize({ w: cols, h: rows }).catch(() => {});
          return;
        }
      } catch {
        // Not JSON — treat as raw stdin
      }

      if (rawSocket.writable) {
        if (typeof data === "string") {
          rawSocket.write(Buffer.from(data, "utf8"));
        } else if (Buffer.isBuffer(data)) {
          rawSocket.write(data);
        } else if (Array.isArray(data)) {
          rawSocket.write(Buffer.concat(data as Buffer[]));
        } else {
          rawSocket.write(Buffer.from(data as ArrayBuffer));
        }
      }
    });

    ws.on("close", () => {
      rawSocket.destroy();
    });

    logger.info({ envId, containerId }, "Docker shell session started (raw socket)");
  });
}
