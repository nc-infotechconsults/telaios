import type { CodingAgentDriver } from "./drivers/base";
import { LangGraphDriver } from "./drivers/langgraph";
import { OpenCodeDriver } from "./drivers/opencode";
import { GitHubCopilotDriver } from "./drivers/githubCopilot";
import { buildChatModel } from "../../core/llm";
import { decrypt } from "../../core/crypto";
import type { Skill, McpServer } from "../../core/types";

export interface AgentProfileConfig {
  id: string;
  agent_type: "langgraph" | "opencode" | "github-copilot";
  llm_provider: string;
  llm_model: string;
  llm_api_key: string;
  llm_base_url?: string;
  github_token?: string;
  mcp_servers: McpServer[];
  skills: Skill[];
}

export class AgentPool {
  private drivers = new Map<string, CodingAgentDriver>();

  initialize(profiles: AgentProfileConfig[]): void {
    for (const profile of profiles) {
      const driver = this.buildDriver(profile);
      this.drivers.set(profile.id, driver);
    }
  }

  getDriver(profileId: string): CodingAgentDriver | undefined {
    return this.drivers.get(profileId);
  }

  private buildDriver(profile: AgentProfileConfig): CodingAgentDriver {
    const apiKey = decrypt(profile.llm_api_key);
    const githubToken = profile.github_token ? decrypt(profile.github_token) : undefined;

    switch (profile.agent_type) {
      case "opencode":
        return new OpenCodeDriver({
          llmProvider: profile.llm_provider,
          llmModel: profile.llm_model,
          llmApiKey: apiKey,
          llmBaseUrl: profile.llm_base_url,
          skills: profile.skills,
          mcpServers: profile.mcp_servers,
        });

      case "github-copilot":
        return new GitHubCopilotDriver({
          githubToken,
          llmProvider: profile.llm_provider,
          llmApiKey: apiKey,
          llmBaseUrl: profile.llm_base_url,
          skills: profile.skills,
        });

      case "langgraph":
      default: {
        const llm = buildChatModel({
          provider: profile.llm_provider,
          model: profile.llm_model,
          apiKey,
          baseUrl: profile.llm_base_url,
        });
        return new LangGraphDriver({ llm, skills: profile.skills });
      }
    }
  }
}
