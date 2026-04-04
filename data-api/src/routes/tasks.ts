import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Task } from "../entities/Task";
import { TaskDependency } from "../entities/TaskDependency";
import { TaskRepository } from "../entities/TaskRepository";

const router = Router();
const taskRepo = () => AppDataSource.getRepository(Task);
const depRepo = () => AppDataSource.getRepository(TaskDependency);
const trRepo = () => AppDataSource.getRepository(TaskRepository);

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
  const { plan_id } = req.query;
  const where = plan_id ? { plan_id: plan_id as string } : {};
  const tasks = await taskRepo().find({
    where,
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies"],
    order: { execution_order: "ASC" },
  });
  res.json(tasks.map(serializeTask));
});

router.post("/", async (req, res) => {
  const { repository_ids, depends_on_task_ids, ...taskData } = req.body as {
    repository_ids?: string[];
    depends_on_task_ids?: string[];
    [key: string]: unknown;
  };

  const task = await taskRepo().save(taskRepo().create(taskData));

  if (repository_ids?.length) {
    const trs = repository_ids.map((rid) =>
      trRepo().create({ task_id: task.id, repository_id: rid })
    );
    await trRepo().save(trs);
  }

  if (depends_on_task_ids?.length) {
    const deps = depends_on_task_ids.map((did) =>
      depRepo().create({ task_id: task.id, depends_on_task_id: did })
    );
    await depRepo().save(deps);
  }

  const full = await taskRepo().findOne({
    where: { id: task.id },
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies"],
  });
  res.status(201).json(serializeTask(full!));
});

router.get("/:id", async (req, res) => {
  const task = await taskRepo().findOne({
    where: { id: req.params.id },
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies", "agentProfile"],
  });
  if (!task) return res.status(404).json({ error: "Not found" });
  return res.json(serializeTask(task));
});

router.patch("/:id", async (req, res) => {
  const { repository_ids, depends_on_task_ids, ...taskData } = req.body as {
    repository_ids?: string[];
    depends_on_task_ids?: string[];
    [key: string]: unknown;
  };

  await taskRepo().update(req.params.id, taskData);

  if (repository_ids !== undefined) {
    await trRepo().delete({ task_id: req.params.id });
    if (repository_ids.length) {
      await trRepo().save(
        repository_ids.map((rid) =>
          trRepo().create({ task_id: req.params.id, repository_id: rid })
        )
      );
    }
  }

  if (depends_on_task_ids !== undefined) {
    await depRepo().delete({ task_id: req.params.id });
    if (depends_on_task_ids.length) {
      await depRepo().save(
        depends_on_task_ids.map((did) =>
          depRepo().create({ task_id: req.params.id, depends_on_task_id: did })
        )
      );
    }
  }

  const updated = await taskRepo().findOne({
    where: { id: req.params.id },
    relations: ["taskRepositories", "taskRepositories.repository", "dependencies"],
  });
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(serializeTask(updated));
});

export default router;

