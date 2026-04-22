import type { Request, Response } from "express";
import { CreateProjectAgentSchema, PatchProjectAgentSchema } from "../schemas/projectAgent.schema";
import * as projectAgentService from "../services/projectAgent.service";

export async function listProjectAgents(req: Request, res: Response) {
  const agents = await projectAgentService.listProjectAgents(req.params.projectId);
  return res.json(agents);
}

export async function cloneFromLibrary(req: Request, res: Response) {
  const { projectId, libraryAgentId } = req.params;
  const agent = await projectAgentService.cloneFromLibrary(projectId, libraryAgentId);
  return res.status(201).json(agent);
}

export async function createProjectAgent(req: Request, res: Response) {
  const parsed = CreateProjectAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const agent = await projectAgentService.createProjectAgent(req.params.projectId, parsed.data);
  return res.status(201).json(agent);
}

export async function updateProjectAgent(req: Request, res: Response) {
  const parsed = PatchProjectAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await projectAgentService.updateProjectAgent(
    req.params.projectId,
    req.params.agentId,
    parsed.data,
  );
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function removeProjectAgent(req: Request, res: Response) {
  await projectAgentService.removeProjectAgent(req.params.projectId, req.params.agentId);
  return res.status(204).send();
}
