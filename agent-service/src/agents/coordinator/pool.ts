import { randomUUID } from "crypto";
import type { CodingAgentDriver } from "./drivers/base";
import { LangGraphDriver } from "./drivers/langgraph";
import { OpenCodeDriver } from "./drivers/opencode";
import { GitHubCopilotDriver } from "./drivers/githubCopilot";
import { BaseAgentDriver } from "./drivers/base-agent-driver";
import { AgentRegistry } from "../../core/agent-framework/registry";
import { ROLE_TO_AGENT_TYPE } from "../register";
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

export interface ProjectAgentConfig {
  id: string;
  agent_profile_id: string;
  role: string;
  scope: Record<string, unknown> | null;
}

export class AgentPool {
  /** Drivers keyed by agent profile ID (legacy CodingAgentDriver path). */
  private drivers = new Map<string, CodingAgentDriver>();

  /**
   * Drivers keyed by role string (reviewer/tester/knowledge/infra).
   * These wrap BaseAgent instances via BaseAgentDriver.
   */
  private roleDrivers = new Map<string, CodingAgentDriver>();

  initialize(profiles: AgentProfileConfig[]): void {
    for (const profile of profiles) {
      const driver = this.buildDriver(profile);
      this.drivers.set(profile.id, driver);
    }
  }

  /**
   * Create BaseAgentDriver-wrapped drivers for specialist roles
   * (reviewer, tester, knowledge, infra) and index them by role.
   * Must be called after `registerAllAgents()`.
   */
  registerRoleDrivers(
    projectAgents: ProjectAgentConfig[],
    projectCtx: { id: string; name: string },
  ): void {
    const registry = AgentRegistry.getInstance();

    for (const pa of projectAgents) {
      const agentType = ROLE_TO_AGENT_TYPE[pa.role];
      if (!agentType) continue; // planner/coder use legacy CodingAgentDriver path
      if (!registry.has(agentType)) continue;

      const instanceId = `${pa.role}-${randomUUID().slice(0, 8)}`;
      const agent = registry.create(agentType, instanceId);
      const driver = new BaseAgentDriver(agent, projectCtx);

      this.roleDrivers.set(pa.role, driver);
      // Also index by profile ID so profile-based fallback still works
      this.drivers.set(pa.agent_profile_id, driver);
    }
  }

  getDriver(profileId: string): CodingAgentDriver | undefined {
    return this.drivers.get(profileId);
  }

  /**
   * Return the driver registered for a given role (e.g. "reviewer", "tester").
   * Returns undefined if no role driver was registered (caller should fall back
   * to a profile-based driver).
   */
  getDriverByRole(role: string): CodingAgentDriver | undefined {
    return this.roleDrivers.get(role);
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
