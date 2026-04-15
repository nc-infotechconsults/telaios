import { In } from "typeorm";
import { AppDataSource } from "../configs/data-source.config";
import { Task } from "../entities/Task.entity";
import { TaskDependency } from "../entities/TaskDependency.entity";
import { TaskRepository } from "../entities/TaskRepository.entity";
import type { CreateTaskDto, PatchTaskDto } from "../schemas/task.schema";

const taskRepo = () => AppDataSource.getRepository(Task);
const depRepo = () => AppDataSource.getRepository(TaskDependency);
const trRepo = () => AppDataSource.getRepository(TaskRepository);

export function serializeTask(
  task: Task & { dependencies?: TaskDependency[]; taskRepositories?: TaskRepository[] }
) {
  return {
    ...task,
    depends_on_task_ids: (task.dependencies ?? []).map((d) => d.depends_on_task_id),
    repository_ids: (task.taskRepositories ?? []).map((tr) => tr.repository_id),
    dependencies: undefined,
    taskRepositories: undefined,
  };
}

export async function listTasks(planId?: string) {
  const where = planId ? { plan_id: planId } : {};
  const tasks = await taskRepo().find({
    where,
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies"],
    order: { execution_order: "ASC" },
  });
  return tasks.map(serializeTask);
}

export async function createTask(dto: CreateTaskDto) {
  const { repository_ids, depends_on_task_ids, ...taskData } = dto;

  const task = await taskRepo().save(taskRepo().create(taskData));

  if (repository_ids?.length) {
    await trRepo().save(
      repository_ids.map((rid) => trRepo().create({ task_id: task.id, repository_id: rid }))
    );
  }

  if (depends_on_task_ids?.length) {
    await depRepo().save(
      depends_on_task_ids.map((did) =>
        depRepo().create({ task_id: task.id, depends_on_task_id: did })
      )
    );
  }

  const full = await taskRepo().findOne({
    where: { id: task.id },
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies"],
  });
  return serializeTask(full!);
}

export async function getTask(id: string) {
  const task = await taskRepo().findOne({
    where: { id },
    relations: [
      "taskRepositories",
      "taskRepositories.repository",
      "dependencies",
      "agentProfile",
    ],
  });
  return task ? serializeTask(task) : null;
}

export async function deleteTasksByPlanId(planId: string): Promise<number> {
  // TaskDependency and TaskRepository are cascade-deleted via the Task entity's onDelete
  const result = await taskRepo().delete({ plan_id: planId });
  return result.affected ?? 0;
}

export async function patchTask(id: string, dto: PatchTaskDto) {
  const { repository_ids, depends_on_task_ids, ...taskData } = dto;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await taskRepo().update(id, taskData as any);

  if (repository_ids !== undefined) {
    await trRepo().delete({ task_id: id });
    if (repository_ids.length) {
      await trRepo().save(
        repository_ids.map((rid) => trRepo().create({ task_id: id, repository_id: rid }))
      );
    }
  }

  if (depends_on_task_ids !== undefined) {
    await depRepo().delete({ task_id: id });
    if (depends_on_task_ids.length) {
      await depRepo().save(
        depends_on_task_ids.map((did) =>
          depRepo().create({ task_id: id, depends_on_task_id: did })
        )
      );
    }
  }

  const updated = await taskRepo().findOne({
    where: { id },
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies"],
  });
  return updated ? serializeTask(updated) : null;
}

const TERMINAL_STATUSES = ["done", "failed", "cancelled", "skipped"] as const;

export async function cancelTask(task_id: string): Promise<ReturnType<typeof serializeTask> | null> {
  const task = await taskRepo().findOne({
    where: { id: task_id },
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies"],
  });
  if (!task) return null;
  if (task.status !== "pending" && task.status !== "ready") {
    throw new Error(
      `Task ${task_id} cannot be cancelled: expected 'pending' or 'ready', got '${task.status}'`
    );
  }
  await taskRepo().update(task_id, { status: "cancelled" });
  return serializeTask({ ...task, status: "cancelled" });
}

export async function skipDependentTasks(
  taskId: string,
  visited: Set<string> = new Set()
): Promise<void> {
  if (visited.has(taskId)) return;
  visited.add(taskId);

  const deps = await depRepo().find({ where: { depends_on_task_id: taskId } });
  if (!deps.length) return;

  const dependentTaskIds = deps.map((d) => d.task_id);
  const tasks = await taskRepo().find({ where: { id: In(dependentTaskIds) } });

  for (const task of tasks) {
    if (!(TERMINAL_STATUSES as readonly string[]).includes(task.status)) {
      await taskRepo().update(task.id, { status: "skipped" });
      await skipDependentTasks(task.id, visited);
    }
  }
}

export async function retryTask(task_id: string): Promise<ReturnType<typeof serializeTask> | null> {
  const task = await taskRepo().findOne({ where: { id: task_id } });
  if (!task) return null;
  if (task.status !== "failed" && task.status !== "skipped") {
    throw new Error(
      `Task ${task_id} cannot be retried: expected 'failed' or 'skipped', got '${task.status}'`
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await taskRepo().update(task_id, { status: "ready", result: null } as any);
  const updated = await taskRepo().findOne({
    where: { id: task_id },
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies"],
  });
  return updated ? serializeTask(updated) : null;
}

export async function cancelPlanTasks(plan_id: string): Promise<number> {
  const tasks = await taskRepo().find({ where: { plan_id } });
  const cancellable = tasks.filter((t) => t.status === "pending" || t.status === "ready");
  if (!cancellable.length) return 0;
  await taskRepo().update({ id: In(cancellable.map((t) => t.id)) }, { status: "cancelled" });
  return cancellable.length;
}
