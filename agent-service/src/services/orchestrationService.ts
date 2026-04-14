/**
 * OrchestrationService — coordinates multi-agent pipelines.
 *
 * Pipelines are defined as sequences of agent steps where each step can
 * be triggered automatically when a preceding step publishes a completion event.
 *
 * Built-in pipelines:
 *  "code-review"   : code → review
 *  "code-test"     : code → test
 *  "full"          : code → review → test
 *  "infra"         : infra generation (single step)
 *  "knowledge"     : knowledge query (single step)
 *
 * The service listens on the AgentEventBus for task completion events from
 * the Scheduler, then spawns follow-up tasks as needed via dataClient.
 *
 * Usage:
 *   const orch = OrchestrationService.getInstance();
 *   orch.start();          // begin listening for events
 *   orch.stop();           // unsubscribe and clean up
 */
import { getAgentEventBus } from "../core/agent-framework/event-bus";
import { dataClient } from "./dataClient";
import { sseManager } from "./sseManager";

export type PipelineStep = "code" | "review" | "test" | "knowledge" | "infra" | "general";

export interface Pipeline {
  name: string;
  /** Ordered steps — each step triggers the next on success */
  steps: PipelineStep[];
}

export const BUILT_IN_PIPELINES: Record<string, Pipeline> = {
  "code-review": { name: "Code + Review", steps: ["code", "review"] },
  "code-test": { name: "Code + Test", steps: ["code", "test"] },
  "full": { name: "Full Pipeline", steps: ["code", "review", "test"] },
  "infra": { name: "Infrastructure", steps: ["infra"] },
  "knowledge": { name: "Knowledge Query", steps: ["knowledge"] },
};

interface ActivePipeline {
  projectId: string;
  planId: string;
  pipeline: Pipeline;
  /** Index of the currently executing step */
  currentStep: number;
  /** Map from step index → task IDs spawned for that step */
  tasksByStep: Map<number, string[]>;
  agentProfileIds: Record<PipelineStep, string | null>;
  repositoryIds: string[];
}

/**
 * Payload emitted by the Scheduler when a task completes or fails.
 * Matches the shape broadcasted via SSE / Redis.
 */
interface TaskStatusEvent {
  type: "task_status";
  task_id: string;
  status: "done" | "failed" | "in_progress";
  pipeline_step?: PipelineStep;
  pipeline_id?: string;
}

export class OrchestrationService {
  private static _instance: OrchestrationService | null = null;
  private activePipelines = new Map<string, ActivePipeline>(); // keyed by planId
  private eventHandler: ((topic: string, payload: unknown) => void) | null = null;
  private taskToPipeline = new Map<string, string>(); // taskId → planId

  private constructor() {}

  static getInstance(): OrchestrationService {
    if (!OrchestrationService._instance) {
      OrchestrationService._instance = new OrchestrationService();
    }
    return OrchestrationService._instance;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  start(): void {
    if (this.eventHandler) return; // already started

    const bus = getAgentEventBus();

    this.eventHandler = (topic: string, payload: unknown) => {
      if (topic === "task.completed" || topic === "task.failed") {
        void this.handleTaskEvent(topic, payload as TaskStatusEvent);
      }
    };

    bus.on("task.completed", this.eventHandler);
    bus.on("task.failed", this.eventHandler);
  }

  stop(): void {
    if (!this.eventHandler) return;
    const bus = getAgentEventBus();
    bus.off("task.completed", this.eventHandler);
    bus.off("task.failed", this.eventHandler);
    this.eventHandler = null;
  }

  // ── Pipeline execution ──────────────────────────────────────────────────────

  /**
   * Register and kick off a pipeline for a plan.
   * Called by executionService after creating a plan.
   */
  async startPipeline(opts: {
    projectId: string;
    planId: string;
    pipelineKey: string;
    agentProfileIds: Record<PipelineStep, string | null>;
    repositoryIds: string[];
    initialTaskTitle?: string;
    initialTaskDescription?: string;
  }): Promise<void> {
    const pipeline = BUILT_IN_PIPELINES[opts.pipelineKey];
    if (!pipeline) throw new Error(`Unknown pipeline: ${opts.pipelineKey}`);

    const active: ActivePipeline = {
      projectId: opts.projectId,
      planId: opts.planId,
      pipeline,
      currentStep: 0,
      tasksByStep: new Map(),
      agentProfileIds: opts.agentProfileIds,
      repositoryIds: opts.repositoryIds,
    };

    this.activePipelines.set(opts.planId, active);

    // Spawn the first step
    await this.spawnStep(active, 0, opts.initialTaskTitle, opts.initialTaskDescription);
  }

  /**
   * Notify the orchestrator that a task has completed.
   * Called by the Scheduler after each task finishes.
   */
  notifyTaskComplete(planId: string, taskId: string, success: boolean): void {
    const active = this.activePipelines.get(planId);
    if (!active) return;

    const currentTaskIds = active.tasksByStep.get(active.currentStep) ?? [];
    if (!currentTaskIds.includes(taskId)) return;

    // Check if all tasks for the current step are done
    const allDone = currentTaskIds.every((id) => {
      return id === taskId ? true : false; // simplified: single task per step
    });

    if (!allDone) return;

    if (!success) {
      // Pipeline failed — clean up
      this.activePipelines.delete(planId);
      sseManager.broadcast(active.projectId, {
        type: "pipeline_failed",
        plan_id: planId,
        step: active.pipeline.steps[active.currentStep],
        step_index: active.currentStep,
      });
      return;
    }

    const nextStep = active.currentStep + 1;
    if (nextStep >= active.pipeline.steps.length) {
      // Pipeline complete
      this.activePipelines.delete(planId);
      sseManager.broadcast(active.projectId, {
        type: "pipeline_complete",
        plan_id: planId,
        pipeline: active.pipeline.name,
      });
      return;
    }

    active.currentStep = nextStep;
    void this.spawnStep(active, nextStep);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async spawnStep(
    active: ActivePipeline,
    stepIndex: number,
    titleOverride?: string,
    descOverride?: string,
  ): Promise<void> {
    const stepType = active.pipeline.steps[stepIndex];
    const agentProfileId = active.agentProfileIds[stepType] ?? null;

    const title = titleOverride ?? `${stepType} — step ${stepIndex + 1}`;
    const description = descOverride ?? `Automated ${stepType} step in pipeline "${active.pipeline.name}"`;

    sseManager.broadcast(active.projectId, {
      type: "pipeline_step_started",
      plan_id: active.planId,
      step: stepType,
      step_index: stepIndex,
      total_steps: active.pipeline.steps.length,
    });

    try {
      const task = await dataClient.createTask({
        plan_id: active.planId,
        title,
        description,
        type: stepType,
        execution_order: stepIndex,
        agent_profile_id: agentProfileId,
        repository_ids: active.repositoryIds,
        status: "ready",
        depends_on_task_ids: [],
        // Mark this as a pipeline-spawned task so Scheduler can handle it
        metadata: { pipeline_step: stepType, pipeline_step_index: stepIndex },
      });

      const taskIds = active.tasksByStep.get(stepIndex) ?? [];
      taskIds.push(task.id);
      active.tasksByStep.set(stepIndex, taskIds);
      this.taskToPipeline.set(task.id, active.planId);
    } catch (err) {
      console.error(`[OrchestrationService] Failed to spawn step ${stepType}:`, err);
    }
  }

  private async handleTaskEvent(_topic: string, payload: TaskStatusEvent): Promise<void> {
    const planId = this.taskToPipeline.get(payload.task_id);
    if (!planId) return;

    const success = payload.status === "done";
    this.notifyTaskComplete(planId, payload.task_id, success);
    this.taskToPipeline.delete(payload.task_id);
  }

  // ── Query helpers ───────────────────────────────────────────────────────────

  getActivePipeline(planId: string): ActivePipeline | undefined {
    return this.activePipelines.get(planId);
  }

  listActivePipelines(): { planId: string; pipeline: string; step: number }[] {
    return Array.from(this.activePipelines.entries()).map(([planId, p]) => ({
      planId,
      pipeline: p.pipeline.name,
      step: p.currentStep,
    }));
  }
}
