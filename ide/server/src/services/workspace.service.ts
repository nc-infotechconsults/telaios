import path from "node:path";
import { config } from "@/core/config";
import { BadRequestError, NotFoundError } from "@/core/errors";

const IGNORED = new Set([".git", "node_modules", ".DS_Store"]);

function workspacePath(workspaceId: string, ...parts: string[]): string {
  const base = path.join(config.WORKSPACES_ROOT, workspaceId);
  if (parts.length === 0) return base;
  const resolved = path.resolve(base, ...parts);
  // prevent path traversal
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new BadRequestError("Path traversal is not allowed");
  }
  return resolved;
}

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

export const WorkspaceService = {
  // ── Directory ──────────────────────────────────────────────────────────────

  async listDir(workspaceId: string, relPath = "."): Promise<DirEntry[]> {
    const dir = workspacePath(workspaceId, relPath);
    const entries: DirEntry[] = [];

    const { opendir } = await import("node:fs/promises");
    for await (const entry of await opendir(dir)) {
      if (IGNORED.has(entry.name)) continue;
      const entryPath = path.join(relPath, entry.name);
      entries.push({
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? "directory" : "file",
      });
    }

    return entries.sort((a, b) => {
      // directories first, then alphabetical
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  },

  // ── File read ──────────────────────────────────────────────────────────────

  async readFile(
    workspaceId: string,
    relPath: string,
  ): Promise<{ content: string; encoding: "utf8" | "base64" }> {
    const abs = workspacePath(workspaceId, relPath);
    const file = Bun.file(abs);

    if (!(await file.exists())) {
      throw new NotFoundError(`File not found: ${relPath}`);
    }

    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);

    // Detect binary: check for null bytes in first 8 KB
    const sample = bytes.subarray(0, Math.min(8192, bytes.length));
    const isBinary = sample.includes(0);

    if (isBinary) {
      return {
        content: Buffer.from(buf).toString("base64"),
        encoding: "base64",
      };
    }

    return {
      content: new TextDecoder().decode(buf),
      encoding: "utf8",
    };
  },

  // ── File write ─────────────────────────────────────────────────────────────

  async writeFile(
    workspaceId: string,
    relPath: string,
    content: string,
    encoding: "utf8" | "base64" = "utf8",
  ): Promise<void> {
    const abs = workspacePath(workspaceId, relPath);
    // Ensure parent directory exists
    await (
      await import("node:fs/promises")
    ).mkdir(path.dirname(abs), { recursive: true });

    const data =
      encoding === "base64" ? Buffer.from(content, "base64") : content;
    await Bun.write(abs, data);
  },

  // ── File delete ────────────────────────────────────────────────────────────

  async deleteFile(workspaceId: string, relPath: string): Promise<void> {
    const abs = workspacePath(workspaceId, relPath);
    const fs = await import("node:fs/promises");
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) throw new NotFoundError(`Path not found: ${relPath}`);

    if (stat.isDirectory()) {
      await fs.rm(abs, { recursive: true, force: true });
    } else {
      await fs.unlink(abs);
    }
  },

  // ── Rename / move ──────────────────────────────────────────────────────────

  async renameFile(
    workspaceId: string,
    oldRel: string,
    newRel: string,
  ): Promise<void> {
    const oldAbs = workspacePath(workspaceId, oldRel);
    const newAbs = workspacePath(workspaceId, newRel);
    const fs = await import("node:fs/promises");
    await fs.mkdir(path.dirname(newAbs), { recursive: true });
    await fs.rename(oldAbs, newAbs);
  },

  // ── Create directory ───────────────────────────────────────────────────────

  async mkdir(workspaceId: string, relPath: string): Promise<void> {
    const abs = workspacePath(workspaceId, relPath);
    await (await import("node:fs/promises")).mkdir(abs, { recursive: true });
  },

  // ── Create file ────────────────────────────────────────────────────────────────

  async createFile(workspaceId: string, dirPath: string, filename: string): Promise<void> {
    const abs = workspacePath(workspaceId, dirPath, filename);
    const fs = await import("node:fs/promises");
    await fs.writeFile(abs, "");
  },

  // ── Create folder ──────────────────────────────────────────────────

  async createFolder(workspaceId: string, dirPath: string, foldername: string): Promise<void> {
    const abs = workspacePath(workspaceId, dirPath, foldername);
    const fs = await import("node:fs/promises");
    await fs.mkdir(abs, { recursive: true });
  },

  // ── Delete entry (file or directory) ─────────────────────────────────

  async deleteEntry(workspaceId: string, relPath: string): Promise<void> {
    const abs = workspacePath(workspaceId, relPath);
    const fs = await import("node:fs/promises");
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat) throw new NotFoundError(`Path not found: ${relPath}`);

    if (stat.isDirectory()) {
      await fs.rm(abs, { recursive: true, force: true });
    } else {
      await fs.unlink(abs);
    }
  },

  // ── Rename entry ────────────────────────────────────────────────────────

  async renameEntry(workspaceId: string, oldRel: string, newRel: string): Promise<void> {
    const oldAbs = workspacePath(workspaceId, oldRel);
    const newAbs = workspacePath(workspaceId, newRel);
    const fs = await import("node:fs/promises");
    await fs.mkdir(path.dirname(newAbs), { recursive: true });
    await fs.rename(oldAbs, newAbs);
  },

  // ── Search ─────────────────────────────────────────────────────────────────

  async search(
    workspaceId: string,
    query: string,
    opts: { maxResults?: number; includePattern?: string } = {},
  ): Promise<Array<{ path: string; line: number; preview: string }>> {
    const root = workspacePath(workspaceId);
    const results: Array<{ path: string; line: number; preview: string }> = [];
    const max = opts.maxResults ?? 200;
    const re = new RegExp(query, "i");

    async function walk(dir: string) {
      if (results.length >= max) return;
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (results.length >= max) break;
        if (IGNORED.has(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else {
          try {
            const text = await Bun.file(full).text();
            const lines = text.split("\n");
            for (let i = 0; i < lines.length && results.length < max; i++) {
              if (re.test(lines[i])) {
                results.push({
                  path: path.relative(root, full),
                  line: i + 1,
                  preview: lines[i].trim().slice(0, 200),
                });
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    await walk(root);
    return results;
  },

  // ── Workspace root helpers ─────────────────────────────────────────────────

  workspaceRootPath(workspaceId: string): string {
    return workspacePath(workspaceId);
  },
};
