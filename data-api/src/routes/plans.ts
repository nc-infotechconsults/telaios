import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Plan } from "../entities/Plan";
import { Task } from "../entities/Task";
import { TaskDependency } from "../entities/TaskDependency";
import { TaskRepository } from "../entities/TaskRepository";

const router = Router();
const repo = () => AppDataSource.getRepository(Plan);

function serializeTask(task: Task & { dependencies?: TaskDependency[]; taskRepositories?: TaskRepository[] }) {
  return {
    ...task,
    depends_on_task_ids: (task.dependencies ?? []).map((d) => d.depends_on_task_id),
    repository_ids: (task.taskRepositories ?? []).map((tr) => tr.repository_id),
    dependencies: undefined,
    taskRepositories: undefined,
  };
}

router.get("/", async (req, res) => {
  const { project_id } = req.query;
  const where = project_id ? { project_id: project_id as string } : {};
  const plans = await repo().find({ where, relations: ["tasks"], order: { created_at: "DESC" } });
  res.json(plans);
});

router.post("/", async (req, res) => {
  const plan = await repo().save(repo().create(req.body));
  res.status(201).json(plan);
});

router.get("/:id", async (req, res) => {
  const plan = await repo().findOne({
    where: { id: req.params.id },
    relations: ["tasks", "tasks.taskRepositories", "tasks.taskRepositories.repository", "tasks.dependencies"],
  });
  if (!plan) return res.status(404).json({ error: "Not found" });
  return res.json({
    ...plan,
    tasks: (plan.tasks ?? []).map(serializeTask),
  });
});

router.patch("/:id", async (req, res) => {
  await repo().update(req.params.id, req.body);
  const updated = await repo().findOneBy({ id: req.params.id });
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

export default router;
