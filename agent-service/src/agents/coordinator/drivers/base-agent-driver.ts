/**
 * BaseAgentDriver — adapter that wraps any BaseAgent into the CodingAgentDriver
 * interface so it can be used transparently by the Scheduler and AgentPool.
 *
 * This bridge lets new agents extend BaseAgent (clean lifecycle, status machine,
 * event publishing) while remaining compatible with the existing execution stack
 * without requiring a full Scheduler rewrite.
 */
import type { CodingAgentDriver, AgentTask, AgentResult, AgentStatus as DriverStatus } from "./base";
import type { BaseAgent } from "../../../core/agent-framework/base-agent";
import type { AgentContext, TaskContext } from "../../../core/agent-framework/context";

export class BaseAgentDriver implements CodingAgentDriver {
  constructor(
    private readonly agent: BaseAgent,
    /** Minimal project context used to build AgentContext for each execution. */
    private readonly projectCtx: {
      id: string;
      name: string;
    },
  ) {}

  async execute(task: AgentTask, workspaces: Record<string, string>): Promise<AgentResult> {
    const taskCtx: TaskContext = {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type as TaskContext["type"],
    };

    const ctx: AgentContext = {
      executionId: task.id,
      project: {
        id: this.projectCtx.id,
        name: this.projectCtx.name,
        repositories: Object.entries(workspaces).map(([name, localPath]) => ({
          id: name,
          fullName: name,
          defaultBranch: "main",
          localPath,
        })),
      },
      task: taskCtx,
      workspaces,
    };

    try {
      await this.agent.init(ctx);
      await this.agent.execute(ctx);

      const result = this.agent.getResult();
      return result ?? { success: true, output: "Agent completed successfully (no explicit result)." };
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async getStatus(): Promise<DriverStatus> {
    const s = this.agent.getStatus();
    switch (s) {
      case "running":
        return "busy";
      case "error":
        return "error";
      default:
        return "idle";
    }
  }
}
