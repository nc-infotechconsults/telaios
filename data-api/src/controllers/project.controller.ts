import type { Request, Response } from "express";
import { CreateProjectSchema, PatchProjectSchema } from "../schemas/project.schema";
import * as projectService from "../services/project.service";

export async function listProjects(_req: Request, res: Response) {
  const projects = await projectService.listProjects();
  res.json(projects);
}

export async function createProject(req: Request, res: Response) {
  const parsed = CreateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const project = await projectService.createProject(parsed.data, req.user?.id);
  return res.status(201).json(project);
}

export async function getProject(req: Request, res: Response) {
  const project = await projectService.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Not found" });
  return res.json(project);
}

export async function patchProject(req: Request, res: Response) {
  const parsed = PatchProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await projectService.patchProject(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteProject(req: Request, res: Response) {
  await projectService.deleteProject(req.params.id);
  res.status(204).send();
}
