import * as fs from "fs";
import * as path from "path";
import * as childProcess from "child_process";
import simpleGit from "simple-git";
import { config } from "../core/config";
import { decrypt } from "../core/crypto";

// Repos are cloned to a dedicated "planning" sub-workspace so they don't
// interfere with execution workspaces.
const PLANNING_ROOT = path.join(config.WORKSPACES_ROOT, "planning");

const IGNORE_DIRS = new Set([
  ".git", "node_modules", "__pycache__", ".next", "dist", "build",
  ".venv", "venv", "vendor", ".turbo", "coverage", ".mypy_cache",
  ".pytest_cache", ".cache",
]);

export interface RepoRef {
  id: string;
  name: string;
  remote_url?: string;
  branch?: string;
  auth_type?: string;
  credentials?: string;
  local_path?: string;
}

// ─── Clone / pull ─────────────────────────────────────────────────────────────

/**
 * Returns a local path where the repo is available.
 * If already cloned (by execution scheduler), reuses that path.
 * Otherwise does a shallow clone into the planning workspace.
 */
export async function ensureLocalPath(repo: RepoRef, projectId: string): Promise<string> {
  // Prefer execution workspace path if already cloned
  if (repo.local_path && fs.existsSync(repo.local_path)) {
    return repo.local_path;
  }

  const planningPath = path.join(PLANNING_ROOT, projectId, repo.name);

  if (fs.existsSync(planningPath)) {
    // Already cloned in planning workspace — try to pull latest
    try { await simpleGit(planningPath).pull(); } catch { /* ignore network errors */ }
    return planningPath;
  }

  if (!repo.remote_url) {
    throw new Error(`Repository "${repo.name}" has no remote URL and is not yet cloned`);
  }

  fs.mkdirSync(path.dirname(planningPath), { recursive: true });

  let cloneUrl = repo.remote_url;
  if (repo.auth_type === "token" && repo.credentials) {
    const token = decrypt(repo.credentials);
    const url = new URL(cloneUrl);
    url.username = token;
    cloneUrl = url.toString();
  }

  await simpleGit().clone(cloneUrl, planningPath, [
    "--depth=1",
    "--branch", repo.branch ?? "main",
    "--single-branch",
  ]);

  return planningPath;
}

// ─── Filesystem tools ─────────────────────────────────────────────────────────

/** Lists files and directories at `relPath` inside the repo. */
export function listDirectory(localPath: string, relPath = ""): string {
  const target = relPath ? path.join(localPath, relPath) : localPath;

  if (!isInsideRoot(localPath, target)) return "Error: path traversal not allowed";

  try {
    if (!fs.existsSync(target)) return `Path not found: ${relPath || "/"}`;
    if (!fs.statSync(target).isDirectory()) return `"${relPath}" is a file, not a directory`;

    const entries = fs.readdirSync(target, { withFileTypes: true });
    const filtered = entries.filter((e) => !IGNORE_DIRS.has(e.name) && !e.name.startsWith("."));
    filtered.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) return "(empty directory)";

    return filtered
      .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}${e.isDirectory() ? "/" : ""}`)
      .join("\n");
  } catch (e) {
    return `Error listing directory: ${e}`;
  }
}

/** Reads file content at `relPath` inside the repo. Truncates large files. */
export function readFile(localPath: string, relPath: string, maxChars = 10_000): string {
  const target = path.join(localPath, relPath);

  if (!isInsideRoot(localPath, target)) return "Error: path traversal not allowed";

  try {
    if (!fs.existsSync(target)) return `File not found: ${relPath}`;
    if (fs.statSync(target).isDirectory()) return `"${relPath}" is a directory — use list_directory instead`;

    const raw = fs.readFileSync(target, "utf-8");
    if (raw.length <= maxChars) return raw;
    return raw.slice(0, maxChars) + `\n\n[... truncated — ${raw.length - maxChars} more characters]`;
  } catch (e) {
    return `Error reading file: ${e}`;
  }
}

/**
 * Searches for a text pattern across the repo (like grep -r).
 * Returns matching file paths and line excerpts (up to 30 matches).
 */
export function searchCode(localPath: string, pattern: string, fileGlob = "*"): string {
  try {
    const safePattern = pattern.replace(/'/g, "'\\''");
    const result = childProcess.execSync(
      `grep -r --include="${fileGlob}" -n "${safePattern}" . 2>/dev/null | head -30`,
      { cwd: localPath, timeout: 8000, encoding: "utf-8" }
    );
    return result.trim() || "No matches found";
  } catch {
    return "No matches found";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
}
