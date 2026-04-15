/**
 * Unit tests for agent-service Scheduler.
 *
 * The Scheduler orchestrates task dispatch in dependency order, manages timing,
 * artifacts, and cascade-skip on failure. We mock all external dependencies
 * (dataClient, redis, sseManager, simpleGit, OrchestrationService, AgentPool).
 */

// ── Mock external modules before any imports ──────────────────────────────────

jest.mock("../../../services/dataClient", () => ({
  dataClient: {
    getProjectRepositories: jest.fn(),
    getPlanTasks: jest.fn(),
    updatePlan: jest.fn(),
    updateTask: jest.fn(),
    updateRepositoryStatus: jest.fn(),
    completePlanExecution: jest.fn(),
    failPlanExecution: jest.fn(),
    skipDependentTasks: jest.fn(),
    createTaskArtifacts: jest.fn(),
  },
}));

jest.mock("../../../core/redis", () => ({
  redis: {
    publish: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../../services/sseManager", () => ({
  sseManager: {
    broadcast: jest.fn(),
  },
}));

jest.mock("../../../services/orchestrationService", () => ({
  OrchestrationService: {
    getInstance: jest.fn().mockReturnValue({
      notifyTaskComplete: jest.fn(),
    }),
  },
}));

jest.mock("simple-git", () => {
  const mockGit = {
    clone: jest.fn().mockResolvedValue(undefined),
    pull: jest.fn().mockResolvedValue(undefined),
    diff: jest.fn().mockResolvedValue(""),
    status: jest.fn().mockResolvedValue({ isClean: () => true }),
    add: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    push: jest.fn().mockResolvedValue(undefined),
  };
  return jest.fn().mockReturnValue(mockGit);
});

jest.mock("../../../core/crypto", () => ({
  decrypt: jest.fn((val: string) => val),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { Scheduler } from "../../../agents/coordinator/scheduler";
import { dataClient } from "../../../services/dataClient";
import { sseManager } from "../../../services/sseManager";
import { OrchestrationService } from "../../../services/orchestrationService";
import type { AgentPool } from "../../../agents/coordinator/pool";
import type { CodingAgentDriver, AgentResult } from "../../../agents/coordinator/drivers/base";

const mockedDataClient = dataClient as jest.Mocked<typeof dataClient>;
const mockedSse = sseManager as jest.Mocked<typeof sseManager>;
const mockedOrch = OrchestrationService as jest.Mocked<typeof OrchestrationService>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockDriver(result: Partial<AgentResult> = {}): CodingAgentDriver {
  return {
    execute: jest.fn().mockResolvedValue({
      success: true,
      output: "done",
      error: undefined,
      artifacts: [],
      ...result,
    }),
    getStatus: jest.fn().mockResolvedValue("idle"),
  };
}

function createMockPool(driver?: CodingAgentDriver): AgentPool {
  const defaultDriver = driver ?? createMockDriver();
  return {
    getDriverByRole: jest.fn().mockReturnValue(defaultDriver),
    getDriver: jest.fn().mockReturnValue(defaultDriver),
    initialize: jest.fn(),
    registerRoleDrivers: jest.fn(),
  } as unknown as AgentPool;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Code Task",
    description: "Write some code",
    type: "code",
    status: "pending",
    agent_profile_id: "profile-1",
    depends_on_task_ids: [] as string[],
    repository_ids: ["repo-1"],
    ...overrides,
  };
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: "repo-1",
    name: "test-repo",
    remote_url: "https://github.com/test/test-repo",
    branch: "main",
    auth_type: "none",
    credentials: "",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Scheduler", () => {
  let scheduler: Scheduler;
  let pool: AgentPool;

  beforeEach(() => {
    jest.clearAllMocks();
    pool = createMockPool();
    scheduler = new Scheduler(pool);
  });

  describe("run() — plan lifecycle", () => {
    it("marks plan as executing at start", async () => {
      const task = makeTask();
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedDataClient.updatePlan).toHaveBeenCalledWith("plan-1", { status: "executing" });
    });

    it("marks plan as completed on success", async () => {
      const task = makeTask();
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedDataClient.completePlanExecution).toHaveBeenCalledWith("plan-1");
    });

    it("marks plan as failed when an error is thrown", async () => {
      mockedDataClient.getProjectRepositories.mockRejectedValue(new Error("Network down"));
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.failPlanExecution.mockResolvedValue(undefined);

      await expect(scheduler.run("project-1", "plan-1")).rejects.toThrow("Network down");

      expect(mockedDataClient.failPlanExecution).toHaveBeenCalledWith(
        "plan-1",
        "Network down",
      );
    });

    it("emits plan_executing SSE event at start", async () => {
      const task = makeTask();
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedSse.broadcast).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({ type: "plan_executing", plan_id: "plan-1" }),
      );
    });

    it("emits plan_completed SSE event on success", async () => {
      const task = makeTask();
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedSse.broadcast).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({ type: "plan_completed", plan_id: "plan-1" }),
      );
    });
  });

  describe("dispatchTask — task lifecycle", () => {
    it("sets task status to in_progress then done on success", async () => {
      const task = makeTask();
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      const updateCalls = mockedDataClient.updateTask.mock.calls;
      // First call: status → in_progress
      expect(updateCalls[0]).toEqual(["task-1", { status: "in_progress" }]);
      // Second call: status → done with result and timing
      expect(updateCalls[1][0]).toBe("task-1");
      expect(updateCalls[1][1]).toMatchObject({
        status: "done",
        result: "done",
      });
      expect(updateCalls[1][1]).toHaveProperty("started_at");
      expect(updateCalls[1][1]).toHaveProperty("completed_at");
    });

    it("sets task status to failed when driver returns failure", async () => {
      const failDriver = createMockDriver({ success: false, output: "", error: "Compilation error" });
      pool = createMockPool(failDriver);
      scheduler = new Scheduler(pool);

      const task = makeTask();
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.skipDependentTasks.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      const updateCalls = mockedDataClient.updateTask.mock.calls;
      expect(updateCalls[1][1]).toMatchObject({
        status: "failed",
        result: "Compilation error",
      });
    });

    it("notifies OrchestrationService on task completion", async () => {
      const task = makeTask();
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      const orchInstance = mockedOrch.getInstance();
      expect(orchInstance.notifyTaskComplete).toHaveBeenCalledWith(
        "plan-1",
        "task-1",
        true,
      );
    });
  });

  describe("dispatchTask — artifacts", () => {
    it("sends agent-produced artifacts to data API", async () => {
      const artifacts = [
        { type: "log" as const, title: "Tool Log", content: "called tool X" },
      ];
      const driver = createMockDriver({ artifacts });
      pool = createMockPool(driver);
      scheduler = new Scheduler(pool);

      const task = makeTask({ repository_ids: [] }); // no repos → no diff artifacts
      mockedDataClient.getProjectRepositories.mockResolvedValue([]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedDataClient.createTaskArtifacts).toHaveBeenCalledWith(
        "task-1",
        expect.arrayContaining([
          expect.objectContaining({ type: "log", title: "Tool Log" }),
        ]),
      );
    });

    it("does not call createTaskArtifacts when there are no artifacts", async () => {
      const driver = createMockDriver({ artifacts: [] });
      pool = createMockPool(driver);
      scheduler = new Scheduler(pool);

      const task = makeTask({ repository_ids: [] });
      mockedDataClient.getProjectRepositories.mockResolvedValue([]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedDataClient.createTaskArtifacts).not.toHaveBeenCalled();
    });
  });

  describe("cascade-skip on failure", () => {
    it("calls skipDependentTasks for failed task with dependents", async () => {
      const failDriver = createMockDriver({ success: false, output: "", error: "Failed" });
      pool = createMockPool(failDriver);
      scheduler = new Scheduler(pool);

      const taskA = makeTask({ id: "task-a" });
      const taskB = makeTask({ id: "task-b", depends_on_task_ids: ["task-a"] });

      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([taskA, taskB]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.skipDependentTasks.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedDataClient.skipDependentTasks).toHaveBeenCalledWith("task-a");
    });

    it("emits skipped SSE events for cascade-skipped dependents", async () => {
      const failDriver = createMockDriver({ success: false, output: "", error: "Failed" });
      pool = createMockPool(failDriver);
      scheduler = new Scheduler(pool);

      const taskA = makeTask({ id: "task-a" });
      const taskB = makeTask({ id: "task-b", depends_on_task_ids: ["task-a"] });

      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([taskA, taskB]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.skipDependentTasks.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedSse.broadcast).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({ type: "task_status", task_id: "task-b", status: "skipped" }),
      );
    });

    it("does not call skipDependentTasks when failed task has no dependents", async () => {
      const failDriver = createMockDriver({ success: false, output: "", error: "Failed" });
      pool = createMockPool(failDriver);
      scheduler = new Scheduler(pool);

      const task = makeTask({ id: "task-a" });

      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.skipDependentTasks.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedDataClient.skipDependentTasks).not.toHaveBeenCalled();
    });
  });

  describe("dependency resolution", () => {
    it("executes independent tasks (parallel dispatch via allSettled)", async () => {
      const driver = createMockDriver();
      pool = createMockPool(driver);
      scheduler = new Scheduler(pool);

      const task1 = makeTask({ id: "t1", depends_on_task_ids: [] });
      const task2 = makeTask({ id: "t2", depends_on_task_ids: [] });

      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task1, task2]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      // Both tasks should have been dispatched (driver.execute called twice)
      expect((driver.execute as jest.Mock).mock.calls.length).toBe(2);
    });

    it("skips tasks already in terminal status from DB", async () => {
      const driver = createMockDriver();
      pool = createMockPool(driver);
      scheduler = new Scheduler(pool);

      const doneTask = makeTask({ id: "t1", status: "done" });
      const pendingTask = makeTask({ id: "t2", depends_on_task_ids: ["t1"] });

      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([doneTask, pendingTask]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      // Only pendingTask should be dispatched (doneTask is pre-completed)
      expect((driver.execute as jest.Mock).mock.calls.length).toBe(1);
    });
  });

  describe("driver resolution", () => {
    it("falls back to profile-based driver when no role driver exists", async () => {
      const roleDriver = createMockDriver();
      const profileDriver = createMockDriver();

      const mockPool: AgentPool = {
        getDriverByRole: jest.fn().mockReturnValue(undefined),
        getDriver: jest.fn().mockReturnValue(profileDriver),
        initialize: jest.fn(),
        registerRoleDrivers: jest.fn(),
      } as unknown as AgentPool;

      scheduler = new Scheduler(mockPool);

      const task = makeTask({ agent_profile_id: "profile-1" });
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.createTaskArtifacts.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockPool.getDriverByRole).toHaveBeenCalledWith("code");
      expect(mockPool.getDriver).toHaveBeenCalledWith("profile-1");
      expect((profileDriver.execute as jest.Mock)).toHaveBeenCalled();
    });

    it("returns failure result when no driver is found", async () => {
      const mockPool: AgentPool = {
        getDriverByRole: jest.fn().mockReturnValue(undefined),
        getDriver: jest.fn().mockReturnValue(undefined),
        initialize: jest.fn(),
        registerRoleDrivers: jest.fn(),
      } as unknown as AgentPool;

      scheduler = new Scheduler(mockPool);

      const task = makeTask({ agent_profile_id: null });
      mockedDataClient.getProjectRepositories.mockResolvedValue([makeRepo()]);
      mockedDataClient.getPlanTasks.mockResolvedValue([task]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.updateTask.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);
      mockedDataClient.skipDependentTasks.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      const updateCalls = mockedDataClient.updateTask.mock.calls;
      // Should update to "failed" with error about missing driver
      expect(updateCalls[1][1]).toMatchObject({
        status: "failed",
        result: "No driver found for task type or profile",
      });
    });
  });

  describe("empty plan", () => {
    it("completes immediately when plan has no tasks", async () => {
      mockedDataClient.getProjectRepositories.mockResolvedValue([]);
      mockedDataClient.getPlanTasks.mockResolvedValue([]);
      mockedDataClient.updatePlan.mockResolvedValue({});
      mockedDataClient.completePlanExecution.mockResolvedValue(undefined);

      await scheduler.run("project-1", "plan-1");

      expect(mockedDataClient.completePlanExecution).toHaveBeenCalledWith("plan-1");
    });
  });
});
