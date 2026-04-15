import { AppDataSource } from "../configs/data-source.config";
import { Plan } from "../entities/Plan.entity";
import { Task } from "../entities/Task.entity";
import { TaskDependency } from "../entities/TaskDependency.entity";
import { TaskRepository } from "../entities/TaskRepository.entity";
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

export async function startExecution(plan_id: string): Promise<Plan | null> {
  const plan = await repo().findOneBy({ id: plan_id });
  if (!plan) return null;
  if (plan.status !== "confirmed") {
    throw new Error(
      `Plan ${plan_id} cannot be started: expected 'confirmed', got '${plan.status}'`
    );
  }
  await repo().update(plan_id, { status: "executing" });
  return repo().findOneBy({ id: plan_id });
}

export async function completePlan(plan_id: string): Promise<Plan | null> {
  const plan = await repo().findOneBy({ id: plan_id });
  if (!plan) return null;
  if (plan.status !== "executing") {
    throw new Error(
      `Plan ${plan_id} cannot be completed: expected 'executing', got '${plan.status}'`
    );
  }
  await repo().update(plan_id, { status: "completed" });
  return repo().findOneBy({ id: plan_id });
}

export async function failPlan(plan_id: string, reason?: string): Promise<Plan | null> {
  const plan = await repo().findOneBy({ id: plan_id });
  if (!plan) return null;
  if (plan.status !== "executing") {
    throw new Error(
      `Plan ${plan_id} cannot be failed: expected 'executing', got '${plan.status}'`
    );
  }
  await repo().update(plan_id, { status: "failed", failure_reason: reason ?? null });
  return repo().findOneBy({ id: plan_id });
}
