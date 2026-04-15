import {
  serializeTask,
  listTasks,
  createTask,
  getTask,
  patchTask,
  cancelTask,
  skipDependentTasks,
  retryTask,
  cancelPlanTasks,
} from "../../../services/task.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Task } from "../../../entities/Task.entity";
import { TaskDependency } from "../../../entities/TaskDependency.entity";
import { TaskRepository } from "../../../entities/TaskRepository.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockTaskRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockDepRepo = {
  save: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  find: jest.fn(),
};

const mockTrRepo = {
  save: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};

beforeEach(() => {
  (AppDataSource.getRepository as jest.Mock).mockImplementation((entity) => {
    if (entity === Task) return mockTaskRepo;
    if (entity === TaskDependency) return mockDepRepo;
    if (entity === TaskRepository) return mockTrRepo;
  });
});

describe("serializeTask", () => {
  it("maps dependencies → depends_on_task_ids and taskRepositories → repository_ids", () => {
    const task = {
      id: "t1",
      title: "Task 1",
      dependencies: [{ depends_on_task_id: "t2" }, { depends_on_task_id: "t3" }],
      taskRepositories: [{ repository_id: "r1" }],
    } as Task & { dependencies: TaskDependency[]; taskRepositories: TaskRepository[] };

    const result = serializeTask(task);

    expect(result.depends_on_task_ids).toEqual(["t2", "t3"]);
    expect(result.repository_ids).toEqual(["r1"]);
    expect(result.dependencies).toBeUndefined();
    expect(result.taskRepositories).toBeUndefined();
  });

  it("returns empty arrays when no dependencies or repositories", () => {
    const task = { id: "t1", title: "Task 1" } as Task;

    const result = serializeTask(task);

    expect(result.depends_on_task_ids).toEqual([]);
    expect(result.repository_ids).toEqual([]);
  });
});

describe("listTasks", () => {
  it("filters by plan_id when planId is provided", async () => {
    const tasks = [{ id: "t1", plan_id: "plan1", dependencies: [], taskRepositories: [] }] as unknown as Task[];
    mockTaskRepo.find.mockResolvedValue(tasks);

    const result = await listTasks("plan1");

    expect(mockTaskRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { plan_id: "plan1" } })
    );
    expect(result).toHaveLength(1);
  });

  it("returns all tasks when no planId is given", async () => {
    mockTaskRepo.find.mockResolvedValue([]);

    await listTasks();

    expect(mockTaskRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });
});

describe("createTask", () => {
  it("saves the task and repository/dependency links, then returns the full serialized task", async () => {
    const task = { id: "t1", title: "Task 1" } as Task;
    const fullTask = {
      id: "t1",
      title: "Task 1",
      dependencies: [{ depends_on_task_id: "t0" }],
      taskRepositories: [{ repository_id: "r1" }],
    } as unknown as Task;

    mockTaskRepo.create.mockReturnValue(task);
    mockTaskRepo.save.mockResolvedValue(task);
    mockTrRepo.create.mockReturnValue({ task_id: "t1", repository_id: "r1" });
    mockTrRepo.save.mockResolvedValue(undefined);
    mockDepRepo.create.mockReturnValue({ task_id: "t1", depends_on_task_id: "t0" });
    mockDepRepo.save.mockResolvedValue(undefined);
    mockTaskRepo.findOne.mockResolvedValue(fullTask);

    const result = await createTask({
      title: "Task 1",
      plan_id: "plan1",
      repository_ids: ["r1"],
      depends_on_task_ids: ["t0"],
    });

    expect(mockTaskRepo.save).toHaveBeenCalled();
    expect(mockTrRepo.save).toHaveBeenCalled();
    expect(mockDepRepo.save).toHaveBeenCalled();
    expect(mockTaskRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1" } })
    );
    expect(result.depends_on_task_ids).toEqual(["t0"]);
    expect(result.repository_ids).toEqual(["r1"]);
  });

  it("does not save repo/dep links when arrays are empty", async () => {
    const task = { id: "t1", title: "Task 1" } as Task;
    const fullTask = { id: "t1", title: "Task 1", dependencies: [], taskRepositories: [] } as unknown as Task;

    mockTaskRepo.create.mockReturnValue(task);
    mockTaskRepo.save.mockResolvedValue(task);
    mockTaskRepo.findOne.mockResolvedValue(fullTask);

    await createTask({ title: "Task 1", plan_id: "plan1" });

    expect(mockTrRepo.save).not.toHaveBeenCalled();
    expect(mockDepRepo.save).not.toHaveBeenCalled();
  });
});

describe("getTask", () => {
  it("returns null when task is not found", async () => {
    mockTaskRepo.findOne.mockResolvedValue(null);

    const result = await getTask("nonexistent");

    expect(result).toBeNull();
  });

  it("returns the serialized task when found", async () => {
    const task = {
      id: "t1",
      title: "Task 1",
      dependencies: [],
      taskRepositories: [],
    } as unknown as Task;
    mockTaskRepo.findOne.mockResolvedValue(task);

    const result = await getTask("t1");

    expect(result).not.toBeNull();
    expect(result!.depends_on_task_ids).toEqual([]);
    expect(result!.repository_ids).toEqual([]);
  });
});

describe("patchTask", () => {
  it("updates the task and refreshes repository/dependency relations", async () => {
    const updated = {
      id: "t1",
      title: "Updated",
      dependencies: [],
      taskRepositories: [{ repository_id: "r2" }],
    } as unknown as Task;

    mockTaskRepo.update.mockResolvedValue({ affected: 1 });
    mockTrRepo.delete.mockResolvedValue({ affected: 1 });
    mockTrRepo.create.mockReturnValue({ task_id: "t1", repository_id: "r2" });
    mockTrRepo.save.mockResolvedValue(undefined);
    mockDepRepo.delete.mockResolvedValue({ affected: 1 });
    mockTaskRepo.findOne.mockResolvedValue(updated);

    const result = await patchTask("t1", {
      title: "Updated",
      repository_ids: ["r2"],
      depends_on_task_ids: [],
    });

    expect(mockTaskRepo.update).toHaveBeenCalledWith("t1", { title: "Updated" });
    expect(mockTrRepo.delete).toHaveBeenCalledWith({ task_id: "t1" });
    expect(mockDepRepo.delete).toHaveBeenCalledWith({ task_id: "t1" });
    expect(result!.repository_ids).toEqual(["r2"]);
  });

  it("returns null when task is not found after update", async () => {
    mockTaskRepo.update.mockResolvedValue({ affected: 0 });
    mockTaskRepo.findOne.mockResolvedValue(null);

    const result = await patchTask("nonexistent", { title: "X" });

    expect(result).toBeNull();
  });
});

describe("cancelTask", () => {
  it("returns null when task is not found", async () => {
    mockTaskRepo.findOne.mockResolvedValue(null);

    const result = await cancelTask("nonexistent");

    expect(result).toBeNull();
  });

  it("throws when task is not in a cancellable state", async () => {
    const task = { id: "t1", status: "in_progress", dependencies: [], taskRepositories: [] } as unknown as Task;
    mockTaskRepo.findOne.mockResolvedValue(task);

    await expect(cancelTask("t1")).rejects.toThrow("cancelled");
  });

  it("cancels a pending task", async () => {
    const task = { id: "t1", status: "pending", dependencies: [], taskRepositories: [] } as unknown as Task;
    mockTaskRepo.findOne.mockResolvedValue(task);
    mockTaskRepo.update.mockResolvedValue({ affected: 1 });

    const result = await cancelTask("t1");

    expect(mockTaskRepo.update).toHaveBeenCalledWith("t1", { status: "cancelled" });
    expect(result?.status).toBe("cancelled");
  });

  it("cancels a ready task", async () => {
    const task = { id: "t1", status: "ready", dependencies: [], taskRepositories: [] } as unknown as Task;
    mockTaskRepo.findOne.mockResolvedValue(task);
    mockTaskRepo.update.mockResolvedValue({ affected: 1 });

    const result = await cancelTask("t1");

    expect(result?.status).toBe("cancelled");
  });
});

describe("skipDependentTasks", () => {
  it("does nothing when there are no dependents", async () => {
    mockDepRepo.find.mockResolvedValue([]);

    await skipDependentTasks("t1");

    expect(mockTaskRepo.update).not.toHaveBeenCalled();
  });

  it("skips all non-terminal dependent tasks", async () => {
    mockDepRepo.find
      .mockResolvedValueOnce([{ task_id: "t2" }, { task_id: "t3" }])
      .mockResolvedValue([]); // no further dependents
    mockTaskRepo.find.mockResolvedValueOnce([
      { id: "t2", status: "pending" },
      { id: "t3", status: "ready" },
    ] as unknown as Task[]);
    mockTaskRepo.update.mockResolvedValue({ affected: 1 });

    await skipDependentTasks("t1");

    expect(mockTaskRepo.update).toHaveBeenCalledWith("t2", { status: "skipped" });
    expect(mockTaskRepo.update).toHaveBeenCalledWith("t3", { status: "skipped" });
  });

  it("does not skip already terminal dependents", async () => {
    mockDepRepo.find
      .mockResolvedValueOnce([{ task_id: "t2" }])
      .mockResolvedValue([]);
    mockTaskRepo.find.mockResolvedValueOnce([
      { id: "t2", status: "done" },
    ] as unknown as Task[]);

    await skipDependentTasks("t1");

    expect(mockTaskRepo.update).not.toHaveBeenCalled();
  });

  it("prevents infinite loops via the visited set", async () => {
    // t2 depends on t1 (which just failed), and t1 depends on t2 (circular).
    // t1 has status "failed" (terminal), so it will not be re-updated.
    mockDepRepo.find
      .mockResolvedValueOnce([{ task_id: "t2" }]) // deps of t1
      .mockResolvedValueOnce([{ task_id: "t1" }]) // deps of t2 (circular ref)
      .mockResolvedValue([]);
    mockTaskRepo.find
      .mockResolvedValueOnce([{ id: "t2", status: "pending" }] as unknown as Task[])
      .mockResolvedValueOnce([{ id: "t1", status: "failed" }] as unknown as Task[]); // terminal → no update
    mockTaskRepo.update.mockResolvedValue({ affected: 1 });

    await skipDependentTasks("t1");

    // Only t2 gets skipped; t1 is already terminal so it is not updated
    expect(mockTaskRepo.update).toHaveBeenCalledTimes(1);
    expect(mockTaskRepo.update).toHaveBeenCalledWith("t2", { status: "skipped" });
  });
});

describe("retryTask", () => {
  it("returns null when task is not found", async () => {
    mockTaskRepo.findOne.mockResolvedValue(null);

    const result = await retryTask("nonexistent");

    expect(result).toBeNull();
  });

  it("throws when task is not in a retryable state", async () => {
    mockTaskRepo.findOne.mockResolvedValue({ id: "t1", status: "done" } as Task);

    await expect(retryTask("t1")).rejects.toThrow("retried");
  });

  it("resets a failed task to 'ready' and clears result", async () => {
    const task = { id: "t1", status: "failed" } as Task;
    const updated = { id: "t1", status: "ready", result: null, dependencies: [], taskRepositories: [] } as unknown as Task;
    mockTaskRepo.findOne
      .mockResolvedValueOnce(task)  // initial fetch
      .mockResolvedValueOnce(updated); // fetch after update
    mockTaskRepo.update.mockResolvedValue({ affected: 1 });

    const result = await retryTask("t1");

    expect(mockTaskRepo.update).toHaveBeenCalledWith("t1", { status: "ready", result: null });
    expect(result?.status).toBe("ready");
  });

  it("resets a skipped task to 'ready'", async () => {
    const task = { id: "t1", status: "skipped" } as Task;
    const updated = { id: "t1", status: "ready", dependencies: [], taskRepositories: [] } as unknown as Task;
    mockTaskRepo.findOne
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(updated);
    mockTaskRepo.update.mockResolvedValue({ affected: 1 });

    const result = await retryTask("t1");

    expect(result?.status).toBe("ready");
  });
});

describe("cancelPlanTasks", () => {
  it("returns 0 when there are no cancellable tasks", async () => {
    mockTaskRepo.find.mockResolvedValue([
      { id: "t1", status: "done" },
      { id: "t2", status: "in_progress" },
    ] as unknown as Task[]);

    const result = await cancelPlanTasks("plan1");

    expect(result).toBe(0);
    expect(mockTaskRepo.update).not.toHaveBeenCalled();
  });

  it("cancels all pending and ready tasks, ignoring others", async () => {
    mockTaskRepo.find.mockResolvedValue([
      { id: "t1", status: "pending" },
      { id: "t2", status: "ready" },
      { id: "t3", status: "in_progress" },
      { id: "t4", status: "done" },
    ] as unknown as Task[]);
    mockTaskRepo.update.mockResolvedValue({ affected: 2 });

    const result = await cancelPlanTasks("plan1");

    expect(result).toBe(2);
    expect(mockTaskRepo.update).toHaveBeenCalledWith(
      { id: expect.anything() },
      { status: "cancelled" }
    );
  });
});
