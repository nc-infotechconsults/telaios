import type { Request, Response } from "express";
import { CreateRepositorySchema, PatchRepositorySchema, TestRepositorySchema } from "../schemas/repository.schema";
import * as repositoryService from "../services/repository.service";

export async function listRepositories(req: Request, res: Response) {
  const repos = await repositoryService.listRepositoriesByProject(req.params.projectId);
  res.json(repos);
}

export async function createRepository(req: Request, res: Response) {
  const parsed = CreateRepositorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const repo = await repositoryService.createRepository(req.params.projectId, parsed.data);
  return res.status(201).json(repo);
}

export async function getRepository(req: Request, res: Response) {
  const repo = await repositoryService.getRepository(req.params.id, req.params.projectId);
  if (!repo) return res.status(404).json({ error: "Not found" });
  return res.json(repo);
}

export async function patchRepository(req: Request, res: Response) {
  const parsed = PatchRepositorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await repositoryService.patchRepository(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteRepository(req: Request, res: Response) {
  await repositoryService.deleteRepository(req.params.id);
  res.status(204).send();
}

export async function patchRepositoryById(req: Request, res: Response) {
  const parsed = PatchRepositorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await repositoryService.patchRepositoryById(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function testRepository(req: Request, res: Response) {
  const parsed = TestRepositorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const result = await repositoryService.testRepository(parsed.data);
  return res.json(result);
}
