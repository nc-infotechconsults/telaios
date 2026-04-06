import type { Request, Response } from "express";
import { AddMemberSchema, PatchMemberSchema } from "../schemas/projectMember.schema";
import * as projectMemberService from "../services/projectMember.service";

export async function listMembers(req: Request, res: Response) {
  const members = await projectMemberService.listMembers(req.params.projectId);
  res.json(members);
}

export async function addMember(req: Request, res: Response) {
  const parsed = AddMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const member = await projectMemberService.addMember(req.params.projectId, parsed.data);
  return res.status(201).json(member);
}

export async function patchMember(req: Request, res: Response) {
  const parsed = PatchMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await projectMemberService.patchMember(
    req.params.projectId,
    req.params.userId,
    parsed.data
  );
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function removeMember(req: Request, res: Response) {
  await projectMemberService.removeMember(req.params.projectId, req.params.userId);
  res.status(204).send();
}
