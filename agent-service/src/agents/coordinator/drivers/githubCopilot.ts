import type { CodingAgentDriver, AgentTask, AgentResult, AgentStatus } from "./base";
import type { Skill } from "../../../core/types";

export interface GitHubCopilotDriverConfig {
  githubToken?: string;
  llmProvider?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  skills: Skill[];
}

export class GitHubCopilotDriver implements CodingAgentDriver {
  private status: AgentStatus = "idle";
  private config: GitHubCopilotDriverConfig;

  constructor(cfg: GitHubCopilotDriverConfig) {
    this.config = cfg;
  }

  async getStatus(): Promise<AgentStatus> {
    return this.status;
  }

  async execute(task: AgentTask, workspaces: Record<string, string>): Promise<AgentResult> {
    this.status = "busy";
    const primaryWorkspace = Object.values(workspaces)[0] ?? process.cwd();

    try {
      const authOptions = this.config.githubToken
        ? { token: this.config.githubToken }
        : {
            byok: {
              provider: this.config.llmProvider ?? "openai",
              apiKey: this.config.llmApiKey ?? "",
              ...(this.config.llmBaseUrl ? { baseURL: this.config.llmBaseUrl } : {}),
            },
          };

      // @github/copilot-sdk — installed separately: npm install @github/copilot-sdk
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const copilotModule = require("@github/copilot-sdk") as {
        createClient: (auth: unknown) => { run: (opts: { prompt: string; cwd: string; tools: string[] }) => Promise<{ output?: string }> }
      };
      const client = copilotModule.createClient(authOptions);

      const skillsContext =
        this.config.skills.length > 0
          ? "\n\nAvailable skills:\n" +
            this.config.skills
              .map((s) => `## ${s.name}\n${s.description}\n${s.instructions}`)
              .join("\n\n")
          : "";

      const prompt = `${task.title}\n\n${task.description}${skillsContext}`;

      const result = await client.run({
        prompt,
        cwd: primaryWorkspace,
        tools: ["all"],
      });

      this.status = "idle";
      return { success: true, output: result?.output ?? "Done" };
    } catch (err) {
      this.status = "error";
      return { success: false, output: "", error: String(err) };
    }
  }
}
