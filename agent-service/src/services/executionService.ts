import { dataClient } from "./dataClient";
import { AgentPool } from "../agents/coordinator/pool";
import { Scheduler } from "../agents/coordinator/scheduler";

export async function startExecution(projectId: string, planId: string): Promise<void> {
  const profiles = await dataClient.getAgentProfiles();

  const pool = new AgentPool();
  pool.initialize(profiles);

  const scheduler = new Scheduler(pool);
  void scheduler.run(projectId, planId);
}
