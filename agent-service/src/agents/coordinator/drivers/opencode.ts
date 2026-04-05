import * as fs from "fs/promises";
import * as path from "path";
import type { CodingAgentDriver, AgentTask, AgentResult, AgentStatus } from "./base";
import type { Skill, McpServer } from "../../../core/types";

export interface OpenCodeDriverConfig {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  skills: Skill[];
  mcpServers: McpServer[];
}

export class OpenCodeDriver implements CodingAgentDriver {
  private status: AgentStatus = "idle";
  private config: OpenCodeDriverConfig;

  constructor(cfg: OpenCodeDriverConfig) {
    this.config = cfg;
  }

  async getStatus(): Promise<AgentStatus> {
    return this.status;
  }

  async execute(task: AgentTask, workspaces: Record<string, string>): Promise<AgentResult> {
    this.status = "busy";
    const primaryWorkspace = Object.values(workspaces)[0] ?? "/tmp";

    try {
      await this.materializeSkills(primaryWorkspace);
      await this.writeOpenCodeConfig(primaryWorkspace);

      // opencode-ai SDK — installed separately: npm install opencode-ai
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const opencodeModule = require("opencode-ai") as { run: (opts: { prompt: string; cwd: string }) => Promise<{ output?: string }> };
      const result = await opencodeModule.run({
        prompt: `${task.title}\n\n${task.description}`,
        cwd: primaryWorkspace,
      });

      this.status = "idle";
      return { success: true, output: result?.output ?? "Done" };
    } catch (err) {
      this.status = "error";
      return { success: false, output: "", error: String(err) };
    }
  }

  private async materializeSkills(workspaceRoot: string): Promise<void> {
    for (const skill of this.config.skills) {
      const dir = path.join(workspaceRoot, ".skills", skill.name);
      await fs.mkdir(dir, { recursive: true });

      const props = skill.inputSchema?.properties ?? {};
      const outputs = skill.outputSchema?.properties ?? {};

      const frontmatter = [
        "---",
        `name: ${skill.name}`,
        `description: ${skill.description}`,
        Object.keys(props).length > 0
          ? "inputSchema:\n" +
            Object.entries(props)
              .map(([k, v]) => `  ${k}: ${Array.isArray(v.type) ? v.type.join("|") : v.type}${v.description ? ` # ${v.description}` : ""}`)
              .join("\n")
          : null,
        Object.keys(outputs).length > 0
          ? "outputSchema:\n" +
            Object.entries(outputs)
              .map(([k, v]) => `  ${k}: ${Array.isArray(v.type) ? v.type.join("|") : v.type}${v.description ? ` # ${v.description}` : ""}`)
              .join("\n")
          : null,
        "---",
      ]
        .filter(Boolean)
        .join("\n");
      await fs.writeFile(path.join(dir, "SKILL.md"), `${frontmatter}\n\n${skill.instructions}`);
    }
  }

  private async writeOpenCodeConfig(workspaceRoot: string): Promise<void> {
    const cfg = {
      provider: {
        name: this.config.llmProvider,
        model: this.config.llmModel,
        ...(this.config.llmBaseUrl ? { baseURL: this.config.llmBaseUrl } : {}),
      },
      mcp: this.config.mcpServers.reduce(
        (acc, s) => {
          acc[s.name] = {
            transport: s.transport,
            ...(s.url ? { url: s.url } : {}),
            ...(s.command ? { command: s.command, args: s.args ?? [] } : {}),
            ...(s.env ? { env: s.env } : {}),
          };
          return acc;
        },
        {} as Record<string, unknown>
      ),
    };
    await fs.writeFile(
      path.join(workspaceRoot, "opencode.json"),
      JSON.stringify(cfg, null, 2)
    );
  }
}
