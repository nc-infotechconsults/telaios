import { Router } from "express";
import { AppDataSource } from "../data-source";
import { AgentProfile } from "../entities/AgentProfile";
import { encrypt, decrypt } from "../middleware/crypto";

const router = Router();
const repo = () => AppDataSource.getRepository(AgentProfile);

router.get("/", async (_req, res) => {
  const profiles = await repo().find({ order: { name: "ASC" } });
  res.json(profiles.map(sanitize));
});

router.post("/", async (req, res) => {
  const body = encryptSensitive(req.body);
  const profile = await repo().save(repo().create(body));
  res.status(201).json(sanitize(profile));
});

router.get("/:id", async (req, res) => {
  const profile = await repo().findOneBy({ id: req.params.id });
  if (!profile) return res.status(404).json({ error: "Not found" });
  return res.json(sanitize(profile));
});

router.patch("/:id", async (req, res) => {
  const body = encryptSensitive(req.body);
  await repo().update(req.params.id, body);
  const updated = await repo().findOneBy({ id: req.params.id });
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(sanitize(updated));
});

router.delete("/:id", async (req, res) => {
  await repo().delete(req.params.id);
  res.status(204).send();
});

function encryptSensitive(body: Record<string, unknown>) {
  const out = { ...body };
  if (out.llm_api_key) out.llm_api_key = encrypt(out.llm_api_key as string);
  if (out.github_token) out.github_token = encrypt(out.github_token as string);
  return out;
}

function sanitize(p: AgentProfile) {
  return {
    ...p,
    llm_api_key: decrypt(p.llm_api_key) ? "***" : "",
    github_token: decrypt(p.github_token) ? "***" : "",
  };
}

export default router;
