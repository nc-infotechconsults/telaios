import { AppDataSource } from "../data-source";
import { Plan } from "../entities/Plan";
import { Task } from "../entities/Task";
import { TaskDependency } from "../entities/TaskDependency";
import { TaskRepository } from "../entities/TaskRepository";
import { serializeTask } from "./task.service";
import type { CreatePlanDto, PatchPlanDto } from "../schemas/plan.schema";

const repo = () => AppDataSource.getRepository(Plan);

export async function listPlans(projectId?: string): Promise<Plan[]> {
  const where = projectId ? { project_id: projectId } : {};
  return repo().find({ where, relations: ["tasks"], order: { created_at: "DESC" } });
}

export async function createPlan(dto: CreatePlanDto): Promise<Plan> {
  return repo().save(repo().create(dto));
}

export async function getPlan(id: string) {
  const plan = await repo().findOne({
    where: { id },
    relations: [
      "tasks",
      "tasks.taskRepositories",
      "tasks.taskRepositories.repository",
      "tasks.dependencies",
    ],
  });
  if (!plan) return null;
  return {
    ...plan,
    tasks: (plan.tasks ?? []).map(
      serializeTask as (
        task: Task & { dependencies?: TaskDependency[]; taskRepositories?: TaskRepository[] }
      ) => ReturnType<typeof serializeTask>
    ),
  };
}

export async function deletePlan(id: string): Promise<boolean> {
  const plan = await repo().findOneBy({ id });
  if (!plan) return false;
  await repo().softDelete(id);
  return true;
}

export async function patchPlan(id: string, dto: PatchPlanDto): Promise<Plan | null> {
  await repo().update(id, dto);
  return repo().findOneBy({ id });
}
