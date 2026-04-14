/**
 * Agent registration — imports all concrete agent types and registers their
 * factories with the AgentRegistry singleton.
 *
 * Call `registerAllAgents()` once at service startup (e.g. in server.ts or
 * executionService.ts) before any agents are instantiated.
 *
 * Agent type strings are the canonical identifiers used for routing:
 *  - "reviewer"  → ReviewAgent
 *  - "tester"    → TestingAgent
 *  - "knowledge" → KnowledgeAgent
 *  - "infra"     → InfraAgent
 *
 * The CodingAgentDriver-based agents (langgraph, opencode, github-copilot)
 * are registered separately in AgentPool and do not go through AgentRegistry.
 */
import { AgentRegistry } from "../core/agent-framework/registry";
import { ReviewAgent } from "./review/review-agent";
import { TestingAgent } from "./testing/testing-agent";
import { KnowledgeAgent } from "./knowledge/knowledge-agent";
import { InfraAgent } from "./infra/infra-agent";
import type { ReviewAgentConfig } from "./review/review-agent";
import type { TestingAgentConfig } from "./testing/testing-agent";
import type { KnowledgeAgentConfig } from "./knowledge/knowledge-agent";
import type { InfraAgentConfig } from "./infra/infra-agent";

export function registerAllAgents(): void {
  const registry = AgentRegistry.getInstance();

  registry.register(
    "reviewer",
    (id, config) => new ReviewAgent(id, config as unknown as ReviewAgentConfig),
  );

  registry.register(
    "tester",
    (id, config) => new TestingAgent(id, config as unknown as TestingAgentConfig),
  );

  registry.register(
    "knowledge",
    (id, config) => new KnowledgeAgent(id, config as unknown as KnowledgeAgentConfig),
  );

  registry.register(
    "infra",
    (id, config) => new InfraAgent(id, config as unknown as InfraAgentConfig),
  );
}

/**
 * Map from AgentRole (data-api) to registry type string.
 * Used by OrchestrationService to look up the right factory.
 */
export const ROLE_TO_AGENT_TYPE: Record<string, string> = {
  reviewer: "reviewer",
  tester: "tester",
  knowledge: "knowledge",
  infra: "infra",
  // "planner" and "coder" are handled by CodingAgentDriver (LangGraph/OpenCode/Copilot)
};
