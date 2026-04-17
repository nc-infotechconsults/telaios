/**
 * Simple workspace metadata registry.
 * Persists workspace records as a JSON file at WORKSPACES_ROOT/_registry.json
 */
import path from "node:path";
import { config } from "@/core/config";
import { NotFoundError } from "@/core/errors";
import { GitService } from "./git.service";

export interface WorkspaceSource {
  type: "git" | "s3" | "platform-project";
  url?: string;
  branch?: string;
  bucket?: string;
  prefix?: string;
}

export type WorkspaceStatus =
  | "idle"
  | "cloning"
  | "starting"
  | "running"
  | "sleeping"
  | "error";

export interface WorkspaceMeta {
  id: string;
  name: string;
  source: WorkspaceSource;
  status: WorkspaceStatus;
  containerId?: string;
  containerImage: string;
  forwardedPorts: number[];
  createdAt: string;
  lastActiveAt: string;
  platformProjectId?: string;
  platformApiUrl?: string;
}

const REGISTRY_PATH = path.join(config.WORKSPACES_ROOT, "_registry.json");

async function ensureRoot() {
  const fs = await import("node:fs/promises");
  await fs.mkdir(config.WORKSPACES_ROOT, { recursive: true });
}

async function load(): Promise<WorkspaceMeta[]> {
  await ensureRoot();
  try {
    const raw = await Bun.file(REGISTRY_PATH).text();
    return JSON.parse(raw) as WorkspaceMeta[];
  } catch {
    return [];
  }
}

async function save(workspaces: WorkspaceMeta[]) {
  await ensureRoot();
  await Bun.write(REGISTRY_PATH, JSON.stringify(workspaces, null, 2));
}

export const WorkspaceRegistry = {
  async list(): Promise<WorkspaceMeta[]> {
    return load();
  },

  async get(id: string): Promise<WorkspaceMeta> {
    const all = await load();
    const ws = all.find((w) => w.id === id);
    if (!ws) throw new NotFoundError(`Workspace not found: ${id}`);
    return ws;
  },

  async create(payload: {
    name: string;
    source: WorkspaceSource;
    platformProjectId?: string;
    platformApiUrl?: string;
  }): Promise<WorkspaceMeta> {
    const all = await load();
    const ws: WorkspaceMeta = {
      id: crypto.randomUUID(),
      name: payload.name,
      source: payload.source,
      status: "idle",
      containerImage: config.DEFAULT_CONTAINER_IMAGE,
      forwardedPorts: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      platformProjectId: payload.platformProjectId,
      platformApiUrl: payload.platformApiUrl,
    };
    all.unshift(ws);
    await save(all);

    // Kick off git clone in background if source is git
    if (payload.source.type === "git" && payload.source.url) {
      ws.status = "cloning";
      await save(all);

      GitService.clone(payload.source.url, ws.id, payload.source.branch)
        .then(async () => {
          const current = await load();
          const idx = current.findIndex((w) => w.id === ws.id);
          if (idx >= 0) {
            current[idx].status = "idle";
            await save(current);
          }
        })
        .catch(async () => {
          const current = await load();
          const idx = current.findIndex((w) => w.id === ws.id);
          if (idx >= 0) {
            current[idx].status = "error";
            await save(current);
          }
        });
    }

    return ws;
  },

  async update(id: string, patch: Partial<WorkspaceMeta>): Promise<WorkspaceMeta> {
    const all = await load();
    const idx = all.findIndex((w) => w.id === id);
    if (idx < 0) throw new NotFoundError(`Workspace not found: ${id}`);
    all[idx] = { ...all[idx], ...patch };
    await save(all);
    return all[idx];
  },

  async delete(id: string): Promise<void> {
    const all = await load();
    const filtered = all.filter((w) => w.id !== id);
    await save(filtered);
  },

  /**
   * Re-pull repos and docs for a platform-project workspace.
   * Pulls the latest from all repositories already cloned in the workspace dir.
   */
  async syncFromPlatform(workspaceId: string): Promise<{ repos_synced: number; errors: string[] }> {
    const ws = await this.get(workspaceId);
    if (!ws.platformProjectId || !ws.platformApiUrl) {
      return { repos_synced: 0, errors: ["Not a platform-project workspace"] };
    }

    const manifestPath = path.join(config.WORKSPACES_ROOT, workspaceId, ".agentscope", "project.json");
    let manifest: { repositories?: Array<{ name: string; branch?: string }> } = {};
    try {
      const raw = await Bun.file(manifestPath).text();
      manifest = JSON.parse(raw) as typeof manifest;
    } catch {
      return { repos_synced: 0, errors: ["project.json manifest not found"] };
    }

    const errors: string[] = [];
    let reposSynced = 0;

    for (const repo of manifest.repositories ?? []) {
      const repoPath = path.join(config.WORKSPACES_ROOT, workspaceId, repo.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
      try {
        const { simpleGit } = await import("simple-git");
        const git = simpleGit({ baseDir: repoPath });
        await git.pull("origin", repo.branch ?? "main");
        reposSynced++;
      } catch (err) {
        errors.push(`${repo.name}: ${String(err)}`);
      }
    }

    return { repos_synced: reposSynced, errors };
  },
};
