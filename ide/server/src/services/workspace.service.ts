import path from "node:path";
import { config } from "@/core/config";
import { BadRequestError, NotFoundError } from "@/core/errors";

const IGNORED = new Set([".git", "node_modules", ".DS_Store"]);

/** Escape special regex characters in a plain string */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert comma-separated glob patterns into an array of RegExp matchers.
 * Supports: `*` (any filename chars), `**` (any path), `?` (single char).
 */
function parseGlobs(pattern: string | undefined): RegExp[] {
  if (!pattern || !pattern.trim()) return [];
  return pattern.split(",").map((g) => {
    let p = g.trim();
    if (!p) return null;
    // Escape regex special chars except * and ?
    p = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    // Convert glob patterns to regex
    p = p.replace(/\*\*/g, "<<GLOBSTAR>>");
    p = p.replace(/\*/g, "[^/]*");
    p = p.replace(/<<GLOBSTAR>>/g, ".*");
    p = p.replace(/\?/g, ".");
    return new RegExp(`^${p}$`);
  }).filter((m): m is RegExp => m !== null);
}

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
    opts: {
      maxResults?: number;
      regex?: boolean;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      include?: string;
      exclude?: string;
    } = {},
  ): Promise<Array<{ path: string; line: number; preview: string }>> {
    const root = workspacePath(workspaceId);
    const results: Array<{ path: string; line: number; preview: string }> = [];
    const max = opts.maxResults ?? 200;

    // Build the search regex
    let pattern = opts.regex ? query : escapeRegExp(query);
    if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
    const flags = opts.caseSensitive ? "g" : "gi";
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch {
      // Invalid regex — return empty
      return results;
    }

    // Build include/exclude matchers from glob patterns
    const includeMatchers = parseGlobs(opts.include);
    const excludeMatchers = parseGlobs(opts.exclude);

    async function walk(dir: string) {
      if (results.length >= max) return;
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (results.length >= max) break;
        if (IGNORED.has(e.name)) continue;
        const full = path.join(dir, e.name);
        const rel = path.relative(root, full);
        if (e.isDirectory()) {
          await walk(full);
        } else {
          // Apply include/exclude filters
          if (includeMatchers.length > 0 && !includeMatchers.some((m) => m.test(rel))) continue;
          if (excludeMatchers.some((m) => m.test(rel))) continue;

          try {
            const text = await Bun.file(full).text();
            const lines = text.split("\n");
            for (let i = 0; i < lines.length && results.length < max; i++) {
              if (re.test(lines[i])) {
                results.push({
                  path: rel,
                  line: i + 1,
                  preview: lines[i].trim().slice(0, 200),
                });
              }
              // Reset regex lastIndex since we use 'g' flag
              re.lastIndex = 0;
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

  // ── Search & Replace ──────────────────────────────────────────────────────

  async searchReplace(
    workspaceId: string,
    query: string,
    replacement: string,
    opts: {
      regex?: boolean;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      include?: string;
      exclude?: string;
      filePaths?: string[];   // If provided, only replace in these files
    } = {},
  ): Promise<{ filesChanged: number; totalReplacements: number }> {
    const root = workspacePath(workspaceId);

    // Build the search regex
    let pattern = opts.regex ? query : escapeRegExp(query);
    if (opts.wholeWord) pattern = `\\b${pattern}\\b`;
    const flags = opts.caseSensitive ? "g" : "gi";
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch {
      return { filesChanged: 0, totalReplacements: 0 };
    }

    const fs = await import("node:fs/promises");
    let filesChanged = 0;
    let totalReplacements = 0;

    // Collect files to process
    const filesToProcess: string[] = [];

    if (opts.filePaths && opts.filePaths.length > 0) {
      // Replace only in specified files
      filesToProcess.push(...opts.filePaths);
    } else {
      // Walk and collect all matching files
      const includeMatchers = parseGlobs(opts.include);
      const excludeMatchers = parseGlobs(opts.exclude);

      async function collectFiles(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (IGNORED.has(e.name)) continue;
          const full = path.join(dir, e.name);
          const rel = path.relative(root, full);
          if (e.isDirectory()) {
            await collectFiles(full);
          } else {
            if (includeMatchers.length > 0 && !includeMatchers.some((m) => m.test(rel))) continue;
            if (excludeMatchers.some((m) => m.test(rel))) continue;
            filesToProcess.push(rel);
          }
        }
      }
      await collectFiles(root);
    }

    // Process each file
    for (const relPath of filesToProcess) {
      const abs = path.join(root, relPath);
      try {
        const text = await Bun.file(abs).text();
        const replaced = text.replace(re, replacement);
        if (replaced !== text) {
          await Bun.write(abs, replaced);
          // Count replacements (reset and count matches in original)
          re.lastIndex = 0;
          const matches = text.match(re);
          totalReplacements += matches ? matches.length : 0;
          filesChanged++;
        }
        re.lastIndex = 0;
      } catch {
        // skip unreadable / unwritable files
      }
    }

    return { filesChanged, totalReplacements };
  },

  // ── Workspace root helpers ─────────────────────────────────────────────────

  workspaceRootPath(workspaceId: string): string {
    return workspacePath(workspaceId);
  },
};
