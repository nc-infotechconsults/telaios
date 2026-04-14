import type { Request, Response } from "express";
import { AssignAgentSchema, PatchProjectAgentSchema } from "../schemas/projectAgent.schema";
import * as projectAgentService from "../services/projectAgent.service";

export async function listProjectAgents(req: Request, res: Response) {
  const agents = await projectAgentService.listProjectAgents(req.params.projectId);
  res.json(agents);
}

export async function assignAgent(req: Request, res: Response) {
  const parsed = AssignAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const assignment = await projectAgentService.assignAgent(req.params.projectId, parsed.data);
  return res.status(201).json(assignment);
}

export async function patchProjectAgent(req: Request, res: Response) {
  const parsed = PatchProjectAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await projectAgentService.patchProjectAgent(
    req.params.projectId,
    req.params.agentId,
    parsed.data,
  );
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function removeProjectAgent(req: Request, res: Response) {
  await projectAgentService.removeProjectAgent(req.params.projectId, req.params.agentId);
  res.status(204).send();
}
