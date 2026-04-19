import type { Request, Response } from "express";
import { CreateTagSchema, PatchTagSchema } from "../schemas/documentTag.schema";
import * as tagService from "../services/documentTag.service";

export async function listTags(req: Request, res: Response) {
  const tags = await tagService.listTags(req.params.projectId);
  res.json(tags);
}

export async function createTag(req: Request, res: Response) {
  const parsed = CreateTagSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const tag = await tagService.createTag(req.params.projectId, parsed.data);
  return res.status(201).json(tag);
}

export async function patchTag(req: Request, res: Response) {
  const parsed = PatchTagSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await tagService.patchTag(req.params.tagId, req.params.projectId, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteTag(req: Request, res: Response) {
  const tag = await tagService.getTag(req.params.tagId, req.params.projectId);
  if (!tag) return res.status(404).json({ error: "Not found" });
  await tagService.deleteTag(req.params.tagId, req.params.projectId);
  res.status(204).send();
}

export async function assignTag(req: Request, res: Response) {
  await tagService.assignTag(req.params.documentId, req.params.tagId);
  res.status(204).send();
}

export async function unassignTag(req: Request, res: Response) {
  await tagService.unassignTag(req.params.documentId, req.params.tagId);
  res.status(204).send();
}

export async function getDocumentTags(req: Request, res: Response) {
  const tags = await tagService.getDocumentTags(req.params.documentId);
  res.json(tags);
}
