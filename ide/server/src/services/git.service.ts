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
    opts: { authorName?: string; authorEmail?: string; amend?: boolean } = {},
  ) {
    const git = repo(workspaceId);
    const env: Record<string, string> = {};
    if (opts.authorName) env.GIT_AUTHOR_NAME = opts.authorName;
    if (opts.authorEmail) env.GIT_AUTHOR_EMAIL = opts.authorEmail;
    const options: Record<string, null | string> = {};
    if (opts.amend) options["--amend"] = null;
    await git.env(env).commit(message, undefined, options);
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
    const git = repo(workspaceId);
    // %H=hash, %P=parent hashes, %D=ref decorations, %s=subject, %an=author, %ar=relative date
    // %x1f is ASCII unit-separator (0x1f) — safe field delimiter
    const out = await git.raw([
      "log",
      `--max-count=${limit}`,
      "--format=%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%ar",
    ]);

    if (!out.trim()) return [];

    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash = "", parents = "", refs = "", message = "", author = "", date = ""] =
          line.split("\x1f");
        return {
          hash,
          shortHash: hash.slice(0, 7),
          message: message.trim(),
          author: author.trim(),
          date: date.trim(),
          parentHashes: parents.trim() ? parents.trim().split(" ") : [],
          refs: refs.trim()
            ? refs.split(",").map((r) => r.trim()).filter(Boolean)
            : [],
        };
      });
  },

  // ── File at ref ────────────────────────────────────────────────────────────

  async fileAtRef(workspaceId: string, filePath: string, ref: string) {
    const git = repo(workspaceId);
    try {
      return await git.show([`${ref}:${filePath}`]);
    } catch {
      return "";
    }
  },

  // ── Discard ───────────────────────────────────────────────────────────────

  async discard(workspaceId: string, paths: string[]) {
    await repo(workspaceId).checkout(["--", ...paths]);
  },

  // ── Stash ─────────────────────────────────────────────────────────────────

  async stashList(workspaceId: string) {
    const git = repo(workspaceId);
    try {
      // %gd=reflog selector (stash@{N}), %gs=stash message, %ar=relative date
      const out = await git.raw(["stash", "list", "--format=%gd%x1f%gs%x1f%ar"]);
      if (!out.trim()) return [];
      return out
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [index = "", message = "", date = ""] = line.split("\x1f");
          return {
            index: index.trim(),
            message: message.trim(),
            date: date.trim(),
          };
        });
    } catch {
      return [];
    }
  },

  async stashPush(workspaceId: string, message?: string) {
    const git = repo(workspaceId);
    const args = ["stash", "push"];
    if (message) args.push("-m", message);
    await git.raw(args);
  },

  async stashPop(workspaceId: string, index?: string) {
    const git = repo(workspaceId);
    const args = ["stash", "pop"];
    if (index) args.push(index);
    await git.raw(args);
  },

  async stashDrop(workspaceId: string, index: string) {
    const git = repo(workspaceId);
    await git.raw(["stash", "drop", index]);
  },

  // ── Show commit ───────────────────────────────────────────────────────────

  async showCommit(workspaceId: string, hash: string) {
    const git = repo(workspaceId);
    // %H=hash %P=parents %D=refs %s=subject %b=body %an=author %ar=relative-date
    // %x00 (null byte) marks end of commit header so we can split cleanly from --name-status
    const raw = await git.raw([
      "show",
      "--name-status",
      "--format=%H%x1f%P%x1f%D%x1f%s%x1f%b%x1f%an%x1f%ar%x00",
      hash,
    ]);

    const nullIdx = raw.indexOf("\x00");
    const headerStr = nullIdx >= 0 ? raw.slice(0, nullIdx) : raw;
    const fileStr   = nullIdx >= 0 ? raw.slice(nullIdx + 1) : "";

    const [
      fullHash = "",
      parents  = "",
      refs     = "",
      subject  = "",
      body     = "",
      author   = "",
      date     = "",
    ] = headerStr.split("\x1f");

    const files = fileStr
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        const rawStatus = parts[0] ?? "";
        const statusChar = rawStatus[0] ?? "M"; // R100 → R, M → M
        if (statusChar === "R" || statusChar === "C") {
          return { path: parts[2] ?? parts[1] ?? "", oldPath: parts[1], status: statusChar };
        }
        return { path: parts[1] ?? "", status: statusChar };
      })
      .filter((f) => f.path);

    return {
      hash: fullHash.trim(),
      shortHash: fullHash.trim().slice(0, 7),
      message: subject.trim(),
      author: author.trim(),
      date: date.trim(),
      parentHashes: parents.trim() ? parents.trim().split(" ") : [],
      refs: refs.trim() ? refs.split(",").map((r) => r.trim()).filter(Boolean) : [],
      body: body.trim(),
      files,
    };
  },

  // ── Task branch helpers ───────────────────────────────────────────────────

  async createTaskBranch(workspaceId: string, taskId: string) {
    const branchName = `task/${taskId}`;
    await GitService.checkout(workspaceId, branchName, true);
    return branchName;
  },
};
