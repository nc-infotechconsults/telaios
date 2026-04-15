import * as path from "path";
import simpleGit from "simple-git";
import { config } from "../../core/config";
import { decrypt } from "../../core/crypto";
import { redis } from "../../core/redis";
import { dataClient } from "../../services/dataClient";
import { OrchestrationService } from "../../services/orchestrationService";
import { AgentPool } from "./pool";
import type { AgentTask } from "./drivers/base";
import { sseManager } from "../../services/sseManager";

interface RepoConfig {
  id: string;
  name: string;
  remote_url: string;
  branch: string;
  auth_type: string;
  credentials: string;
  local_path?: string;
}

interface TaskConfig {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  agent_profile_id: string | null;
  depends_on_task_ids: string[];
  repository_ids: string[];
}

const TERMINAL_STATUSES = new Set(["done", "failed", "skipped", "cancelled"]);

export class Scheduler {
  private pool: AgentPool;

  constructor(pool: AgentPool) {
    this.pool = pool;
  }

  async run(projectId: string, planId: string): Promise<void> {
    // Mark the plan as executing — use generic patch so resume works regardless
    // of current plan status (avoids strict "confirmed" guard on startExecution).
    await dataClient.updatePlan(planId, { status: "executing" });
    this.emit(projectId, { type: "plan_executing", plan_id: planId });

    try {
      await this._runInternal(projectId, planId);

      await dataClient.completePlanExecution(planId);
      this.emit(projectId, { type: "plan_completed", plan_id: planId });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      try {
        await dataClient.failPlanExecution(planId, reason);
      } catch {
        // best-effort — don't shadow the original error
      }
      this.emit(projectId, { type: "plan_failed", plan_id: planId, error: reason });
      throw err;
    }
  }

  private async _runInternal(projectId: string, planId: string): Promise<void> {
    const repositoryList: RepoConfig[] = await dataClient.getProjectRepositories(projectId);
    const tasks: TaskConfig[] = await dataClient.getPlanTasks(planId);

    const workspaceMap = await this.cloneRepositories(projectId, repositoryList);
    const repositories = new Map(repositoryList.map((r) => [r.id, r]));

    // terminalIds — all terminal tasks (done/failed/skipped/cancelled).
    //   Used for loop-termination and filtering ready tasks.
    // completedIds — only "done" tasks.
    //   Used to satisfy dependency checks so failed tasks don't unblock dependents.
    const terminalIds = new Set<string>();
    const completedIds = new Set<string>();
    const inFlightIds = new Set<string>();

    // Pre-populate from DB state so resume works correctly.
    for (const t of tasks) {
      if (TERMINAL_STATUSES.has(t.status)) terminalIds.add(t.id);
      if (t.status === "done") completedIds.add(t.id);
    }

    while (terminalIds.size < tasks.length) {
      const ready = tasks.filter((t) => {
        if (terminalIds.has(t.id) || inFlightIds.has(t.id)) return false;
        return t.depends_on_task_ids.every((id) => completedIds.has(id));
      });

      if (ready.length === 0) {
        if (inFlightIds.size === 0) break; // deadlock or all tasks accounted for
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const dispatches = ready.map((task) =>
        this.dispatchTask(
          projectId,
          planId,
          task,
          tasks,
          workspaceMap,
          repositories,
          terminalIds,
          completedIds,
          inFlightIds,
        )
      );

      await Promise.allSettled(dispatches);
    }
  }

  /**
   * Compute all transitive dependents of `taskId` within the loaded task list,
   * excluding tasks already in `excludeIds`.
   */
  private getTransitiveDependents(
    taskId: string,
    tasks: TaskConfig[],
    excludeIds: Set<string>,
  ): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const traverse = (id: string): void => {
      const direct = tasks.filter(
        (t) => t.depends_on_task_ids.includes(id) && !excludeIds.has(t.id),
      );
      for (const dep of direct) {
        if (visited.has(dep.id)) continue;
        visited.add(dep.id);
        result.push(dep.id);
        traverse(dep.id);
      }
    };

    traverse(taskId);
    return result;
  }

  private async cloneRepositories(
    projectId: string,
    repositories: RepoConfig[]
  ): Promise<Map<string, string>> {
    const workspaceMap = new Map<string, string>();

    for (const repo of repositories) {
      const localPath = path.join(config.WORKSPACES_ROOT, projectId, repo.name);
      const cloneUrl = this.buildCloneUrl(repo);

      this.emit(projectId, {
        type: "repo_status",
        repo_id: repo.id,
        repo_name: repo.name,
        status: "cloning",
      });

      try {
        const git = simpleGit();
        try {
          await git.clone(cloneUrl, localPath, ["--branch", repo.branch ?? "main"]);
        } catch {
          await simpleGit(localPath).pull();
        }

        await dataClient.updateRepositoryStatus(repo.id, {
          status: "ready",
          local_path: localPath,
        });

        workspaceMap.set(repo.id, localPath);

        this.emit(projectId, {
          type: "repo_status",
          repo_id: repo.id,
          repo_name: repo.name,
          status: "ready",
        });
      } catch (err) {
        await dataClient.updateRepositoryStatus(repo.id, {
          status: "error",
          error_message: String(err),
        });
        this.emit(projectId, {
          type: "repo_status",
          repo_id: repo.id,
          repo_name: repo.name,
          status: "error",
          message: String(err),
        });
      }
    }

    return workspaceMap;
  }

  private buildCloneUrl(repo: RepoConfig): string {
    if (repo.auth_type === "token") {
      const token = decrypt(repo.credentials);
      const url = new URL(repo.remote_url);
      url.username = token;
      return url.toString();
    }
    return repo.remote_url;
  }

  /**
   * After a task completes, attempt to push any commits made in each workspace.
   * This is best-effort — failures are logged but do not fail the task.
   */
  private async pushWorkspaces(
    projectId: string,
    task: TaskConfig,
    workspaceMap: Map<string, string>,
    repositories: Map<string, RepoConfig>
  ): Promise<void> {
    for (const repoId of task.repository_ids) {
      const localPath = workspaceMap.get(repoId);
      const repo = repositories.get(repoId);
      if (!localPath || !repo) continue;

      try {
        const git = simpleGit(localPath);

        // Stage and commit any uncommitted changes the agent left behind
        const status = await git.status();
        if (!status.isClean()) {
          await git.add(".");
          await git.commit(`chore: agent result for task "${task.title}"`, { "--allow-empty": null });
        }

        // Push with the authenticated remote URL
        const pushUrl = this.buildCloneUrl(repo);
        await git.push(pushUrl, repo.branch ?? "main");

        this.emit(projectId, {
          type: "repo_status",
          repo_id: repo.id,
          repo_name: repo.name,
          status: "ready",
          message: "Changes pushed to remote",
        });
      } catch (err) {
        // Non-fatal — log and continue
        console.error(`[Scheduler] Failed to push repo ${repo.name}:`, err);
        this.emit(projectId, {
          type: "repo_status",
          repo_id: repo.id,
          repo_name: repo.name,
          status: "ready",
          message: `Push failed (non-fatal): ${String(err)}`,
        });
      }
    }
  }

  private async dispatchTask(
    projectId: string,
    planId: string,
    task: TaskConfig,
    allTasks: TaskConfig[],
    workspaceMap: Map<string, string>,
    repositories: Map<string, RepoConfig>,
    terminalIds: Set<string>,
    completedIds: Set<string>,
    inFlightIds: Set<string>
  ): Promise<void> {
    inFlightIds.add(task.id);

    await dataClient.updateTask(task.id, { status: "in_progress" });
    this.emit(projectId, {
      type: "task_status",
      task_id: task.id,
      status: "in_progress",
      agent_profile_id: task.agent_profile_id,
    });

    const workspaces: Record<string, string> = {};
    for (const repoId of task.repository_ids) {
      const localPath = workspaceMap.get(repoId);
      const repoName = repositories.get(repoId)?.name ?? repoId;
      if (localPath) workspaces[repoName] = localPath;
    }

    if (Object.keys(workspaces).length === 0) {
      const first = workspaceMap.values().next().value;
      if (first) workspaces["default"] = first;
    }

    const agentTask: AgentTask = {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      agentProfileId: task.agent_profile_id,
    };

    // ── Driver resolution: role-based first, then profile-based ──────────────
    const driver =
      this.pool.getDriverByRole(task.type) ??
      (task.agent_profile_id ? this.pool.getDriver(task.agent_profile_id) : null);

    this.emit(projectId, {
      type: "agent_started",
      task_id: task.id,
      agent_role: task.type,
      agent_profile_id: task.agent_profile_id ?? undefined,
    });

    let result;
    const startedAt = new Date().toISOString();

    if (driver) {
      result = await driver.execute(agentTask, workspaces);
    } else {
      result = { success: false, output: "", error: "No driver found for task type or profile" };
    }

    const completedAt = new Date().toISOString();

    // Capture git diff across all assigned workspaces
    const diffArtifacts: Array<{
      type: "diff";
      title: string;
      content: string;
      content_type: string;
      sort_order: number;
    }> = [];
    let diffIdx = 0;
    for (const repoId of task.repository_ids) {
      const localPath = workspaceMap.get(repoId);
      const repoName = repositories.get(repoId)?.name ?? repoId;
      if (!localPath) continue;
      try {
        const git = simpleGit(localPath);
        const diff = await git.diff(["HEAD"]);
        if (diff.trim().length > 0) {
          diffArtifacts.push({
            type: "diff",
            title: `Git diff — ${repoName}`,
            content: diff,
            content_type: "text/x-diff",
            sort_order: diffIdx++,
          });
        }
      } catch {
        // non-fatal
      }
    }

    const newStatus = result.success ? "done" : "failed";
    await dataClient.updateTask(task.id, {
      status: newStatus,
      result: result.output || result.error,
      started_at: startedAt,
      completed_at: completedAt,
    });

    // Persist all artifacts (diffs + agent-produced)
    const agentArtifacts = (result.artifacts ?? []).map((a, i) => ({
      ...a,
      sort_order: diffArtifacts.length + i,
    }));
    const allArtifacts = [...diffArtifacts, ...agentArtifacts];
    if (allArtifacts.length > 0) {
      try {
        await dataClient.createTaskArtifacts(task.id, allArtifacts);
      } catch (err) {
        console.error(`[Scheduler] createTaskArtifacts failed for task ${task.id}:`, err);
      }
    }

    this.emit(projectId, {
      type: "task_status",
      task_id: task.id,
      status: newStatus,
      agent_profile_id: task.agent_profile_id,
    });

    if (result.success) {
      this.emit(projectId, {
        type: "agent_completed",
        task_id: task.id,
        agent_role: task.type,
      });
    } else {
      this.emit(projectId, {
        type: "agent_failed",
        task_id: task.id,
        agent_role: task.type,
        error: result.error,
      });
    }

    // Push any commits the agent made — best-effort, non-fatal
    if (result.success) {
      await this.pushWorkspaces(projectId, task, workspaceMap, repositories);
    }

    inFlightIds.delete(task.id);
    terminalIds.add(task.id);

    if (result.success) {
      completedIds.add(task.id);
    } else {
      // Cascade-skip all transitive dependents of the failed task.
      // 1. Compute dependents locally (avoids extra DB round-trips for in-memory tracking).
      // 2. Persist to DB via the internal endpoint.
      // 3. Add to terminalIds and emit SSE so the loop and the frontend stay in sync.
      const dependents = this.getTransitiveDependents(task.id, allTasks, terminalIds);
      if (dependents.length > 0) {
        try {
          await dataClient.skipDependentTasks(task.id);
        } catch (err) {
          console.error(`[Scheduler] skipDependentTasks failed for task ${task.id}:`, err);
        }
        for (const depId of dependents) {
          terminalIds.add(depId);
          this.emit(projectId, {
            type: "task_status",
            task_id: depId,
            status: "skipped",
          });
        }
      }
    }

    void redis.publish(
      `project:${projectId}:task`,
      JSON.stringify({ task_id: task.id, status: newStatus })
    );

    OrchestrationService.getInstance().notifyTaskComplete(planId, task.id, result.success);
  }

  private emit(projectId: string, event: object): void {
    sseManager.broadcast(projectId, event);
    void redis.publish(`project:${projectId}:events`, JSON.stringify(event));
  }
}
