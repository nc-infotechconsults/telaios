import * as path from "path";
import simpleGit from "simple-git";
import { config } from "../../core/config";
import { decrypt } from "../../core/crypto";
import { redis } from "../../core/redis";
import { dataClient } from "../../services/dataClient";
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

export class Scheduler {
  private pool: AgentPool;

  constructor(pool: AgentPool) {
    this.pool = pool;
  }

  async run(projectId: string, planId: string): Promise<void> {
    const repositoryList: RepoConfig[] = await dataClient.getProjectRepositories(projectId);
    const tasks: TaskConfig[] = await dataClient.getPlanTasks(planId);

    const workspaceMap = await this.cloneRepositories(projectId, repositoryList);

    const repositories = new Map(repositoryList.map((r) => [r.id, r]));
    const completedIds = new Set<string>();
    const inFlightIds = new Set<string>();

    const pendingTasks = tasks.filter((t) => t.status !== "done" && t.status !== "failed");

    while (completedIds.size < pendingTasks.length) {
      const ready = pendingTasks.filter((t) => {
        if (completedIds.has(t.id) || inFlightIds.has(t.id)) return false;
        return t.depends_on_task_ids.every((id) => completedIds.has(id));
      });

      if (ready.length === 0) {
        if (inFlightIds.size === 0) break;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const dispatches = ready.map((task) =>
        this.dispatchTask(projectId, task, workspaceMap, repositories, completedIds, inFlightIds)
      );

      await Promise.allSettled(dispatches);
    }
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

  private async dispatchTask(
    projectId: string,
    task: TaskConfig,
    workspaceMap: Map<string, string>,
    repositories: Map<string, RepoConfig>,
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

    const driver = task.agent_profile_id ? this.pool.getDriver(task.agent_profile_id) : null;

    let result;
    if (driver) {
      result = await driver.execute(agentTask, workspaces);
    } else {
      result = { success: false, output: "", error: "No driver found for profile" };
    }

    const newStatus = result.success ? "done" : "failed";
    await dataClient.updateTask(task.id, {
      status: newStatus,
      result: result.output || result.error,
    });

    this.emit(projectId, {
      type: "task_status",
      task_id: task.id,
      status: newStatus,
      agent_profile_id: task.agent_profile_id,
    });

    inFlightIds.delete(task.id);
    if (result.success) completedIds.add(task.id);

    void redis.publish(
      `project:${projectId}:task`,
      JSON.stringify({ task_id: task.id, status: newStatus })
    );
  }

  private emit(projectId: string, event: object): void {
    sseManager.broadcast(projectId, event);
    void redis.publish(`project:${projectId}:events`, JSON.stringify(event));
  }
}
