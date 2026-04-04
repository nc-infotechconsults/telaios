import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Repository } from "../entities/Repository";
import { encrypt, decrypt } from "../middleware/crypto";

const router = Router({ mergeParams: true });
const repo = () => AppDataSource.getRepository(Repository);

router.get("/:projectId/repositories", async (req, res) => {
  const repos = await repo().find({
    where: { project_id: req.params.projectId },
    order: { name: "ASC" },
  });
  res.json(repos.map(sanitize));
});

router.post("/:projectId/repositories", async (req, res) => {
  const body = { ...req.body, project_id: req.params.projectId };
  if (body.credentials) body.credentials = encrypt(body.credentials);
  const saved = await repo().save(repo().create(body)) as unknown as Repository;
  res.status(201).json(sanitize(saved));
});

router.get("/:projectId/repositories/:id", async (req, res) => {
  const r = await repo().findOneBy({ id: req.params.id, project_id: req.params.projectId });
  if (!r) return res.status(404).json({ error: "Not found" });
  return res.json(sanitize(r));
});

router.patch("/:projectId/repositories/:id", async (req, res) => {
  const body = { ...req.body };
  if (body.credentials) body.credentials = encrypt(body.credentials);
  await repo().update(req.params.id, body);
  const updated = await repo().findOneBy({ id: req.params.id });
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(sanitize(updated));
});

router.delete("/:projectId/repositories/:id", async (req, res) => {
  await repo().delete(req.params.id);
  res.status(204).send();
});

function sanitize(r: Repository) {
  const { credentials, ...rest } = r;
  return { ...rest, has_credentials: !!decrypt(credentials) };
}

export default router;
