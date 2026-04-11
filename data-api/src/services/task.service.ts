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
