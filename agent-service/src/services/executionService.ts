import { dataClient } from "./dataClient";
import { AgentPool } from "../agents/coordinator/pool";
import { Scheduler } from "../agents/coordinator/scheduler";
import { registerAllAgents } from "../agents/register";
import { OrchestrationService } from "./orchestrationService";

export async function startExecution(projectId: string, planId: string): Promise<void> {
  // Register all specialist agents (idempotent — registry is a singleton)
  registerAllAgents();

  // Start the orchestration service so it can advance multi-agent pipelines
  OrchestrationService.getInstance().start();

  const [profiles, project, projectAgents] = await Promise.all([
    dataClient.getAgentProfiles(),
    dataClient.getProject(projectId),
    dataClient.getProjectAgents(projectId),
  ]);

  const pool = new AgentPool();
  pool.initialize(profiles);
  pool.registerRoleDrivers(projectAgents, { id: project.id, name: project.name });

  const scheduler = new Scheduler(pool);
  void scheduler.run(projectId, planId);
}
