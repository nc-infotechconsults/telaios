import { spawn } from "child_process";
import { mkdtemp, writeFile, rm, access, constants } from "fs/promises";
import path from "path";
import os from "os";
import { AppDataSource } from "../configs/data-source.config";
import { Repository } from "../entities/Repository.entity";
import { encrypt, decrypt } from "../utils/crypto.util";
import type { CreateRepositoryDto, PatchRepositoryDto, TestRepositoryDto } from "../schemas/repository.schema";

// ─── Repository test types ────────────────────────────────────────────────────

export type RepoTestCode =
  | "OK"
  | "INVALID_URL"
  | "INVALID_PATH"
  | "TIMEOUT"
  | "AUTH_FAILED"
  | "BRANCH_NOT_FOUND"
  | "NOT_A_REPO"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export interface RepoTestResult {
  ok: boolean;
  code: RepoTestCode;
  message: string;
  default_branch?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runGitCommand(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("TIMEOUT"));
    }, timeoutMs);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function sanitizeOutput(text: string, sensitiveValues: string[]): string {
  let result = text;
  for (const val of sensitiveValues) {
    if (val) {
      result = result.replace(
        new RegExp(val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
        "***"
      );
    }
  }
  // Strip any embedded URL credentials (https://user:pass@host)
  result = result.replace(/https?:\/\/[^:]+:[^@]+@/g, "https://***@");
  return result.trim();
}

async function testLocalRepository(localPath: string): Promise<RepoTestResult> {
  if (!localPath) {
    return { ok: false, code: "INVALID_PATH", message: "Local path is required" };
  }
  if (!path.isAbsolute(localPath)) {
    return { ok: false, code: "INVALID_PATH", message: "Path must be absolute" };
  }
  const normalized = path.normalize(localPath);
  if (normalized.split(path.sep).includes("..")) {
    return { ok: false, code: "INVALID_PATH", message: "Path contains invalid traversal" };
  }

  try {
    await access(normalized, constants.R_OK);
  } catch {
    return { ok: false, code: "INVALID_PATH", message: "Path does not exist or is not readable" };
  }

  try {
    const result = await runGitCommand(
      ["-C", normalized, "rev-parse", "--is-inside-work-tree"],
      { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      10_000
    );
    if (result.code === 0 && result.stdout.trim() === "true") {
      return { ok: true, code: "OK", message: "Valid local Git repository" };
    }
    return { ok: false, code: "NOT_A_REPO", message: "Path exists but is not a Git repository" };
  } catch (err) {
    if (err instanceof Error && err.message === "TIMEOUT") {
      return { ok: false, code: "TIMEOUT", message: "Git command timed out" };
    }
    return { ok: false, code: "UNKNOWN_ERROR", message: "Failed to check repository" };
  }
}

async function testRemoteRepository(dto: TestRepositoryDto): Promise<RepoTestResult> {
  const { remote_url, branch, auth_type = "none", credentials } = dto;

  if (!remote_url) {
    return { ok: false, code: "INVALID_URL", message: "Remote URL is required" };
  }

  const isHttps = remote_url.startsWith("http://") || remote_url.startsWith("https://");
  const isSsh = remote_url.startsWith("git@") || remote_url.startsWith("ssh://");

  if (isHttps) {
    try { new URL(remote_url); } catch {
      return { ok: false, code: "INVALID_URL", message: "Invalid URL format" };
    }
    if (auth_type === "ssh") {
      return { ok: false, code: "INVALID_URL", message: "SSH auth requires an SSH URL (git@host:path)" };
    }
  } else if (isSsh) {
    if (auth_type === "token") {
      return { ok: false, code: "INVALID_URL", message: "Token auth requires an HTTPS URL" };
    }
  } else {
    return { ok: false, code: "INVALID_URL", message: "URL must start with https://, http://, git@, or ssh://" };
  }

  const sensitiveValues: string[] = [];
  let tmpDir: string | null = null;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
  };

  try {
    if (auth_type === "token" && credentials) {
      sensitiveValues.push(credentials);
      tmpDir = await mkdtemp(path.join(os.tmpdir(), "git-test-"));
      const askpassPath = path.join(tmpDir, "askpass.sh");
      const escaped = credentials.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      await writeFile(askpassPath, `#!/bin/sh\necho "${escaped}"\n`, { mode: 0o700 });
      env.GIT_ASKPASS = askpassPath;
    } else if (auth_type === "ssh" && credentials) {
      sensitiveValues.push(credentials);
      tmpDir = await mkdtemp(path.join(os.tmpdir(), "git-ssh-"));
      const keyPath = path.join(tmpDir, "id_key");
      const keyContent = credentials.endsWith("\n") ? credentials : credentials + "\n";
      await writeFile(keyPath, keyContent, { mode: 0o600 });
      env.GIT_SSH_COMMAND = `ssh -i ${keyPath} -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
    }

    const args = ["ls-remote", "--symref", remote_url, "HEAD"];
    if (branch) args.push(`refs/heads/${branch}`);

    const result = await runGitCommand(args, env, 20_000);

    if (result.code === 0) {
      const symrefMatch = result.stdout.match(/^ref: refs\/heads\/([^\t\n]+)\tHEAD/m);
      const defaultBranch = symrefMatch?.[1];

      if (branch) {
        const branchFound = result.stdout.includes(`refs/heads/${branch}`);
        if (!branchFound) {
          return {
            ok: false,
            code: "BRANCH_NOT_FOUND",
            message: `Repository is reachable but branch "${branch}" was not found`,
            default_branch: defaultBranch,
          };
        }
      }

      return { ok: true, code: "OK", message: "Repository is reachable", default_branch: defaultBranch };
    }

    const combined = sanitizeOutput(`${result.stderr}\n${result.stdout}`, sensitiveValues).toLowerCase();

    if (combined.includes("authentication failed") || combined.includes("invalid credentials") ||
        combined.includes("403") || combined.includes("permission denied") ||
        combined.includes("could not read username")) {
      return { ok: false, code: "AUTH_FAILED", message: "Authentication failed. Check your credentials." };
    }
    if (combined.includes("could not resolve") || combined.includes("name or service not known") ||
        combined.includes("connection refused") || combined.includes("unable to connect") ||
        combined.includes("network is unreachable")) {
      return { ok: false, code: "NETWORK_ERROR", message: "Could not reach the remote host. Check the URL." };
    }
    if (combined.includes("repository not found") || combined.includes("does not exist") ||
        combined.includes("not found")) {
      return { ok: false, code: "NETWORK_ERROR", message: "Repository not found. Check the URL and access permissions." };
    }

    const rawMsg = sanitizeOutput(`${result.stderr}\n${result.stdout}`, sensitiveValues);
    return { ok: false, code: "UNKNOWN_ERROR", message: rawMsg || "Git command failed" };
  } catch (err) {
    if (err instanceof Error && err.message === "TIMEOUT") {
      return { ok: false, code: "TIMEOUT", message: "Connection timed out after 20s. Check the URL and network." };
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, code: "UNKNOWN_ERROR", message: sanitizeOutput(msg, sensitiveValues) };
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

const repo = () => AppDataSource.getRepository(Repository);

export function sanitizeRepository(r: Repository) {
  const { credentials, ...rest } = r;
  return { ...rest, has_credentials: !!decrypt(credentials) };
}

export async function listRepositoriesByProject(projectId: string) {
  const repos = await repo().find({
    where: { project_id: projectId },
    order: { name: "ASC" },
  });
  return repos.map(sanitizeRepository);
}

export async function createRepository(projectId: string, dto: CreateRepositoryDto) {
  const data: Record<string, unknown> = { ...dto, project_id: projectId };
  if (dto.credentials) data.credentials = encrypt(dto.credentials);
  const saved = await repo().save(repo().create(data as Partial<Repository>));
  return sanitizeRepository(saved as unknown as Repository);
}

export async function getRepository(id: string, projectId: string) {
  const r = await repo().findOneBy({ id, project_id: projectId });
  return r ? sanitizeRepository(r) : null;
}

export async function patchRepository(id: string, dto: PatchRepositoryDto) {
  const data: Record<string, unknown> = { ...dto };
  if (dto.credentials) data.credentials = encrypt(dto.credentials);
  await repo().update(id, data);
  const updated = await repo().findOneBy({ id });
  return updated ? sanitizeRepository(updated) : null;
}

export async function patchRepositoryById(id: string, dto: PatchRepositoryDto) {
  return patchRepository(id, dto);
}

export async function deleteRepository(id: string): Promise<void> {
  await repo().softDelete(id);
}

export async function testRepository(dto: TestRepositoryDto): Promise<RepoTestResult> {
  if (dto.source_type === "local") return testLocalRepository(dto.local_path ?? "");
  return testRemoteRepository(dto);
}
