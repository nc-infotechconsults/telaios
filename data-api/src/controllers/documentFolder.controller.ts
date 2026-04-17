import type { Request, Response } from "express";
import { CreateFolderSchema, PatchFolderSchema } from "../schemas/documentFolder.schema";
import * as folderService from "../services/documentFolder.service";
import * as activityService from "../services/documentActivity.service";

export async function listFolders(req: Request, res: Response) {
  const parentFolderId = req.query.parent_folder_id as string | undefined;
  const folders = await folderService.listFolders(req.params.projectId, parentFolderId ?? null);
  res.json(folders);
}

export async function listAllFolders(req: Request, res: Response) {
  const folders = await folderService.listAllFolders(req.params.projectId);
  res.json(folders);
}

export async function getFolder(req: Request, res: Response) {
  const folder = await folderService.getFolder(req.params.id, req.params.projectId);
  if (!folder) return res.status(404).json({ error: "Not found" });
  return res.json(folder);
}

export async function createFolder(req: Request, res: Response) {
  const parsed = CreateFolderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  const userId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const folder = await folderService.createFolder(req.params.projectId, userId, parsed.data);

  void activityService.recordActivity(folder.id, userId, "created", { type: "folder", name: folder.name });

  return res.status(201).json(folder);
}

export async function patchFolder(req: Request, res: Response) {
  const parsed = PatchFolderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await folderService.patchFolder(req.params.id, req.params.projectId, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteFolder(req: Request, res: Response) {
  const folder = await folderService.getFolder(req.params.id, req.params.projectId);
  if (!folder) return res.status(404).json({ error: "Not found" });
  await folderService.deleteFolder(req.params.id, req.params.projectId);
  res.status(204).send();
}
