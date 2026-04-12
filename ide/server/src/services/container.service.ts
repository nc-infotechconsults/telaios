import Docker from "dockerode";
import path from "node:path";
import { config } from "@/core/config";
import { NotFoundError } from "@/core/errors";

export type ContainerStatus =
  | "running"
  | "sleeping"
  | "starting"
  | "stopped"
  | "missing";

export interface WorkspaceContainerInfo {
  workspaceId: string;
  containerId: string;
  status: ContainerStatus;
  image: string;
  lastActiveAt: Date;
}

const docker = config.DISABLE_CONTAINERS ? null : new Docker();

// In-memory registry: workspaceId → container info
const registry = new Map<string, WorkspaceContainerInfo>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function hostPath(workspaceId: string): string {
  return path.join(config.WORKSPACES_HOST_PATH, workspaceId);
}

async function devcontainerImage(workspaceId: string): Promise<string> {
  const dcFile = path.join(
    config.WORKSPACES_ROOT,
    workspaceId,
    ".devcontainer",
    "devcontainer.json",
  );
  try {
    const raw = await Bun.file(dcFile).text();
    // Strip JSON5 comments before parsing
    const cleaned = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const dc = JSON.parse(cleaned);
    return dc.image ?? config.DEFAULT_CONTAINER_IMAGE;
  } catch {
    return config.DEFAULT_CONTAINER_IMAGE;
  }
}

async function runPostCreateCommand(
  workspaceId: string,
  container: Docker.Container,
): Promise<void> {
  const dcFile = path.join(
    config.WORKSPACES_ROOT,
    workspaceId,
    ".devcontainer",
    "devcontainer.json",
  );
  try {
    const raw = await Bun.file(dcFile).text();
    const cleaned = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const dc = JSON.parse(cleaned);
    if (!dc.postCreateCommand) return;

    const cmd =
      typeof dc.postCreateCommand === "string"
        ? ["sh", "-c", dc.postCreateCommand]
        : dc.postCreateCommand;

    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: "/workspace",
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    // drain the stream so we don't block
    await new Promise<void>((resolve) => {
      stream.on("end", resolve);
      stream.on("error", resolve);
      stream.resume();
    });
  } catch {
    // non-fatal; ignore errors in devcontainer setup
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const ContainerService = {
  /** Get current status of a workspace container (no side effects). */
  async status(workspaceId: string): Promise<ContainerStatus> {
    if (config.DISABLE_CONTAINERS) return "running";
    const info = registry.get(workspaceId);
    if (!info) return "missing";

    try {
      const container = docker!.getContainer(info.containerId);
      const data = await container.inspect();
      if (data.State.Running) return "running";
      if (data.State.Paused) return "sleeping";
      return "stopped";
    } catch {
      registry.delete(workspaceId);
      return "missing";
    }
  },

  /** Start (or resume) a workspace container. Idempotent. */
  async start(
    workspaceId: string,
    imageOverride?: string,
  ): Promise<WorkspaceContainerInfo> {
    if (config.DISABLE_CONTAINERS) {
      const stub: WorkspaceContainerInfo = {
        workspaceId,
        containerId: "disabled",
        status: "running",
        image: "none",
        lastActiveAt: new Date(),
      };
      registry.set(workspaceId, stub);
      return stub;
    }

    // Already running?
    const existing = registry.get(workspaceId);
    if (existing) {
      try {
        const c = docker!.getContainer(existing.containerId);
        const data = await c.inspect();
        if (data.State.Running) {
          existing.lastActiveAt = new Date();
          return existing;
        }
        // Paused → unpause
        if (data.State.Paused) {
          await c.unpause();
          existing.status = "running";
          existing.lastActiveAt = new Date();
          return existing;
        }
        // Stopped → start
        await c.start();
        existing.status = "running";
        existing.lastActiveAt = new Date();
        return existing;
      } catch {
        registry.delete(workspaceId);
      }
    }

    const image = imageOverride ?? (await devcontainerImage(workspaceId));

    // Pull image if not present
    try {
      await docker!.getImage(image).inspect();
    } catch {
      console.log(`[container] pulling image ${image}…`);
      await new Promise<void>((resolve, reject) => {
        docker!.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          docker!.modem.followProgress(stream, (e: Error | null) =>
            e ? reject(e) : resolve(),
          );
        });
      });
    }

    const container = await docker!.createContainer({
      Image: image,
      name: `ide-workspace-${workspaceId}`,
      Cmd: ["tail", "-f", "/dev/null"],
      WorkingDir: "/workspace",
      HostConfig: {
        Binds: [`${hostPath(workspaceId)}:/workspace`],
        AutoRemove: false,
      },
      Labels: { "ide.workspace": workspaceId },
    });

    await container.start();
    await runPostCreateCommand(workspaceId, container);

    const info: WorkspaceContainerInfo = {
      workspaceId,
      containerId: container.id,
      status: "running",
      image,
      lastActiveAt: new Date(),
    };
    registry.set(workspaceId, info);
    return info;
  },

  /** Pause a running container (fast sleep). */
  async sleep(workspaceId: string): Promise<void> {
    if (config.DISABLE_CONTAINERS) return;
    const info = registry.get(workspaceId);
    if (!info) return;
    try {
      await docker!.getContainer(info.containerId).pause();
      info.status = "sleeping";
    } catch {
      // ignore — container may already be gone
    }
  },

  /** Stop and remove a workspace container. */
  async stop(workspaceId: string): Promise<void> {
    if (config.DISABLE_CONTAINERS) {
      registry.delete(workspaceId);
      return;
    }
    const info = registry.get(workspaceId);
    if (!info) return;
    try {
      const c = docker!.getContainer(info.containerId);
      await c.stop({ t: 5 });
      await c.remove({ force: true });
    } catch {
      // ignore
    }
    registry.delete(workspaceId);
  },

  /** Open an interactive exec session (TTY) for the terminal panel. */
  async exec(
    workspaceId: string,
    opts: { cols: number; rows: number },
  ): Promise<{
    stream: NodeJS.ReadWriteStream;
    resize: (cols: number, rows: number) => Promise<void>;
  }> {
    if (config.DISABLE_CONTAINERS) {
      // Spawn a real PTY using the host shell inside the workspace directory.
      const { EventEmitter } = await import("node:events");
      const { mkdir } = await import("node:fs/promises");
      const pty = await import("node-pty");

      const workspacePath = path.join(config.WORKSPACES_ROOT, workspaceId);
      const shell = process.env.SHELL ?? "/bin/bash";

      // The workspace dir may not exist yet (clone still in progress, or
      // non-git source).  Create it so node-pty doesn't throw posix_spawnp.
      await mkdir(workspacePath, { recursive: true });

      // node-pty requires env values to be strings (not string | undefined)
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) env[k] = v;
      }
      env.TERM = "xterm-256color";

      const ptyProcess = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols: opts.cols,
        rows: opts.rows,
        cwd: workspacePath,
        env,
      });

      const emitter = new EventEmitter();

      // node-pty fires data as strings; the WS handler expects Buffer chunks
      ptyProcess.onData((data: string) => {
        emitter.emit("data", Buffer.from(data, "utf-8"));
      });

      ptyProcess.onExit(() => {
        emitter.emit("end");
      });

      const stream = Object.assign(emitter, {
        write(data: string | Buffer | Uint8Array): boolean {
          try {
            ptyProcess.write(
              typeof data === "string" ? data : Buffer.from(data).toString("utf-8"),
            );
          } catch {
            // PTY may have already exited
          }
          return true;
        },
        end() {
          try { ptyProcess.kill(); } catch { /* ignore */ }
          return emitter;
        },
      }) as unknown as NodeJS.ReadWriteStream;

      return {
        stream,
        resize: async (cols: number, rows: number) => {
          try { ptyProcess.resize(cols, rows); } catch { /* ignore */ }
        },
      };
    }
    const info = registry.get(workspaceId);
    if (!info) throw new NotFoundError("Workspace container not found");

    const container = docker!.getContainer(info.containerId);
    const exec = await container.exec({
      Cmd: ["/bin/bash"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: [`COLUMNS=${opts.cols}`, `LINES=${opts.rows}`],
      WorkingDir: "/workspace",
    });

    const stream = (await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    })) as unknown as NodeJS.ReadWriteStream;

    return {
      stream,
      resize: async (cols: number, rows: number) => {
        try {
          await exec.resize({ h: rows, w: cols });
        } catch {
          // ignore — exec may have already exited
        }
      },
    };
  },

  /** Record heartbeat to prevent auto-sleep. */
  heartbeat(workspaceId: string): void {
    const info = registry.get(workspaceId);
    if (info) info.lastActiveAt = new Date();
  },

  /** Inspect the in-memory registry (for the auto-sleep ticker). */
  allWorkspaces(): WorkspaceContainerInfo[] {
    return [...registry.values()];
  },
};

// ── Container recovery ────────────────────────────────────────────────────────
// On module load, scan Docker for containers with the ide.workspace label and
// re-populate the in-memory registry so a server restart doesn't orphan them.

async function recoverContainers(): Promise<void> {
  if (config.DISABLE_CONTAINERS || !docker) return;
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: ["ide.workspace"] }),
    });
    for (const c of containers) {
      const workspaceId = c.Labels?.["ide.workspace"];
      if (!workspaceId) continue;
      let status: ContainerStatus = "stopped";
      if (c.State === "running") status = "running";
      else if (c.State === "paused") status = "sleeping";
      registry.set(workspaceId, {
        workspaceId,
        containerId: c.Id,
        status,
        image: c.Image,
        lastActiveAt: new Date(),
      });
      console.log(`[container] recovered workspace ${workspaceId} (${status})`);
    }
  } catch (err) {
    console.warn("[container] failed to recover containers from Docker:", err);
  }
}

void recoverContainers();

// ── Auto-sleep ticker ─────────────────────────────────────────────────────────

const SLEEP_MS = config.SLEEP_TIMEOUT_MINUTES * 60 * 1000;

setInterval(async () => {
  if (config.DISABLE_CONTAINERS) return;
  const now = Date.now();
  for (const info of ContainerService.allWorkspaces()) {
    if (
      info.status === "running" &&
      now - info.lastActiveAt.getTime() > SLEEP_MS
    ) {
      console.log(`[auto-sleep] sleeping workspace ${info.workspaceId}`);
      await ContainerService.sleep(info.workspaceId);
    }
  }
}, 60_000);
