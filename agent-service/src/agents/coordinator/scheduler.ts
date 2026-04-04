import * as path from "path";
import simpleGit from "simple-git";
import { config } from "../../core/config";
import { decrypt } from "../../core/crypto";
import { redis } from "../../core/redis";
import { dataClient } from "../../services/dataClient";
import { AgentPool } from "./pool";
import type { AgentTask } from "./drivers/base";
import { wsManager } from "../../services/wsManager";

interface RepoConfig {
  id: string;
  name: string;
  remote_url: string;
  branch: string;
  auth_type: string;
  credentials: string;
  local_clone_path?: string;
}

interface TaskConfig {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  agent_profile_id: string | null;
  taskRepositories: Array<{ repository: RepoConfig }>;
  dependencies: Array<{ depends_on_task_id: string }>;
}

export class Scheduler {
  private pool: AgentPool;

  constructor(pool: AgentPool) {
    this.pool = pool;
  }

  async run(projectId: string, planId: string): Promise<void> {
    const repositories: RepoConfig[] = await dataClient.getProjectRepositories(projectId);
    const tasks: TaskConfig[] = await dataClient.getPlanTasks(planId);

    const workspaceMap = await this.cloneRepositories(projectId, repositories);

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const completedIds = new Set<string>();
    const inFlightIds = new Set<string>();

    const pendingTasks = tasks.filter((t) => t.status !== "done" && t.status !== "failed");

    while (completedIds.size < pendingTasks.length) {
      const ready = pendingTasks.filter((t) => {
        if (completedIds.has(t.id) || inFlightIds.has(t.id)) return false;
        return t.dependencies.every((d) => completedIds.has(d.depends_on_task_id));
      });

      if (ready.length === 0) {
        if (inFlightIds.size === 0) break;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const dispatches = ready.map((task) =>
        this.dispatchTask(projectId, task, workspaceMap, completedIds, inFlightIds, taskMap)
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
          local_clone_path: localPath,
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
    completedIds: Set<string>,
    inFlightIds: Set<string>,
    taskMap: Map<string, TaskConfig>
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
    for (const tr of task.taskRepositories) {
      const localPath = workspaceMap.get(tr.repository.id);
      if (localPath) workspaces[tr.repository.name] = localPath;
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
    wsManager.broadcast(projectId, event);
    void redis.publish(`project:${projectId}:events`, JSON.stringify(event));
  }
}
