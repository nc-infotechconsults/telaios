import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Project } from "../entities/Project";

const router = Router();
const repo = () => AppDataSource.getRepository(Project);

router.get("/", async (_req, res) => {
  const projects = await repo().find({ order: { created_at: "DESC" } });
  res.json(projects);
});

router.post("/", async (req, res) => {
  const project = repo().create(req.body);
  const saved = await repo().save(project);
  res.status(201).json(saved);
});

router.get("/:id", async (req, res) => {
  const project = await repo().findOne({
    where: { id: req.params.id },
    relations: ["repositories", "plans"],
  });
  if (!project) return res.status(404).json({ error: "Not found" });
  return res.json(project);
});

router.patch("/:id", async (req, res) => {
  await repo().update(req.params.id, req.body);
  const updated = await repo().findOneBy({ id: req.params.id });
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

router.delete("/:id", async (req, res) => {
  await repo().delete(req.params.id);
  res.status(204).send();
});

export default router;
