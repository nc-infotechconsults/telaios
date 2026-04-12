import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { config } from "@/core/config";
import { BadRequestError, InternalError } from "@/core/errors";
import path from "node:path";

function repo(workspaceId: string): SimpleGit {
  const cwd = path.join(config.WORKSPACES_ROOT, workspaceId);
  return simpleGit({ baseDir: cwd, binary: "git", maxConcurrentProcesses: 4 });
}

function mapStatus(status: StatusResult) {
  const files: Array<{
    path: string;
    status: string;
    staged: boolean;
  }> = [];

  const push = (
    paths: string[],
    gitStatus: string,
    staged: boolean,
  ) => {
    for (const p of paths) {
      files.push({ path: p, status: gitStatus, staged });
    }
  };

  push(status.staged.filter((f) => !status.renamed.find((r) => r.to === f)), "modified", true);
  push(status.modified, "modified", false);
  push(status.created, "added", true);
  push(status.not_added, "untracked", false);
  push(status.deleted, "deleted", false);
  push(status.conflicted, "conflicted", false);
  for (const r of status.renamed) {
    files.push({ path: r.to, status: "renamed", staged: true });
  }

  return files;
}

export const GitService = {
  // ── Clone ──────────────────────────────────────────────────────────────────

  async clone(
    url: string,
    workspaceId: string,
    branch?: string,
  ): Promise<void> {
    const dest = path.join(config.WORKSPACES_ROOT, workspaceId);
    const git = simpleGit();
    const args = branch ? ["--branch", branch, "--single-branch"] : [];
    await git.clone(url, dest, args);
  },

  // ── Status ─────────────────────────────────────────────────────────────────

  async status(workspaceId: string) {
    const git = repo(workspaceId);
    const [status, branchSummary] = await Promise.all([
      git.status(),
      git.branch(),
    ]);

    const currentBranch = branchSummary.current;
    let ahead = 0;
    let behind = 0;

    try {
      const tracking = await git.revparse([
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ]);
      if (tracking) {
        const result = await git.raw([
          "rev-list",
          "--left-right",
          "--count",
          "HEAD...@{u}",
        ]);
        const [a, b] = result.trim().split(/\s+/).map(Number);
        ahead = a ?? 0;
        behind = b ?? 0;
      }
    } catch {
      // no upstream — fine
    }

    return {
      branch: currentBranch,
      ahead,
      behind,
      files: mapStatus(status),
      isClean: status.isClean(),
    };
  },

  // ── Branches ───────────────────────────────────────────────────────────────

  async branches(workspaceId: string) {
    const summary = await repo(workspaceId).branch(["-a", "-vv"]);
    return Object.values(summary.branches).map((b) => ({
      name: b.name,
      current: b.current,
      remote: b.linkedWorkTree ? undefined : undefined,
      ahead: 0,
      behind: 0,
    }));
  },

  async checkout(workspaceId: string, branch: string, create = false) {
    const git = repo(workspaceId);
    if (create) {
      await git.checkoutLocalBranch(branch);
    } else {
      await git.checkout(branch);
    }
  },

  // ── Stage / unstage ────────────────────────────────────────────────────────

  async stage(workspaceId: string, paths: string[]) {
    await repo(workspaceId).add(paths);
  },

  async unstage(workspaceId: string, paths: string[]) {
    await repo(workspaceId).reset(["HEAD", "--", ...paths]);
  },

  async stageAll(workspaceId: string) {
    await repo(workspaceId).add(".");
  },

  // ── Commit ─────────────────────────────────────────────────────────────────

  async commit(
    workspaceId: string,
    message: string,
    opts: { authorName?: string; authorEmail?: string } = {},
  ) {
    const git = repo(workspaceId);
    const env: Record<string, string> = {};
    if (opts.authorName) env.GIT_AUTHOR_NAME = opts.authorName;
    if (opts.authorEmail) env.GIT_AUTHOR_EMAIL = opts.authorEmail;
    await git.env(env).commit(message);
  },

  // ── Push / pull ────────────────────────────────────────────────────────────

  async push(workspaceId: string, remote = "origin", branch?: string) {
    const git = repo(workspaceId);
    const currentBranch =
      branch ?? (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    await git.push(remote, currentBranch, ["--set-upstream"]);
  },

  async pull(workspaceId: string, remote = "origin") {
    await repo(workspaceId).pull(remote);
  },

  // ── Diff ──────────────────────────────────────────────────────────────────

  async diff(workspaceId: string, filePath?: string, staged = false) {
    const git = repo(workspaceId);
    const args: string[] = staged ? ["--staged"] : [];
    if (filePath) args.push("--", filePath);
    return git.diff(args);
  },

  // ── Log ───────────────────────────────────────────────────────────────────

  async log(workspaceId: string, limit = 50) {
    const result = await repo(workspaceId).log({ maxCount: limit });
    return result.all.map((c) => ({
      hash: c.hash,
      shortHash: c.hash.slice(0, 7),
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  },

  // ── Discard ───────────────────────────────────────────────────────────────

  async discard(workspaceId: string, paths: string[]) {
    await repo(workspaceId).checkout(["--", ...paths]);
  },

  // ── Task branch helpers ───────────────────────────────────────────────────

  async createTaskBranch(workspaceId: string, taskId: string) {
    const branchName = `task/${taskId}`;
    await GitService.checkout(workspaceId, branchName, true);
    return branchName;
  },
};
