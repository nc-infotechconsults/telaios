import type { Request, Response } from "express";
import { CreateAgentProfileSchema, PatchAgentProfileSchema } from "../schemas/agentProfile.schema";
import * as agentProfileService from "../services/agentProfile.service";

export async function listAgentProfiles(_req: Request, res: Response) {
  const profiles = await agentProfileService.listAgentProfiles();
  res.json(profiles);
}

export async function createAgentProfile(req: Request, res: Response) {
  const parsed = CreateAgentProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const profile = await agentProfileService.createAgentProfile(parsed.data);
  return res.status(201).json(profile);
}

export async function getAgentProfile(req: Request, res: Response) {
  const profile = await agentProfileService.getAgentProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: "Not found" });
  return res.json(profile);
}

export async function patchAgentProfile(req: Request, res: Response) {
  const parsed = PatchAgentProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await agentProfileService.patchAgentProfile(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteAgentProfile(req: Request, res: Response) {
  await agentProfileService.deleteAgentProfile(req.params.id);
  res.status(204).send();
}
