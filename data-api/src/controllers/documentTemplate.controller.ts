import type { Request, Response } from "express";
import { CreateTemplateSchema, PatchTemplateSchema } from "../schemas/documentTemplate.schema";
import * as templateService from "../services/documentTemplate.service";
import { uploadToS3 } from "../utils/s3.util";

export async function listGlobalTemplates(_req: Request, res: Response) {
  const templates = await templateService.listGlobalTemplates();
  res.json(templates);
}

export async function listProjectTemplates(req: Request, res: Response) {
  const templates = await templateService.listProjectTemplates(req.params.projectId);
  res.json(templates);
}

export async function getTemplate(req: Request, res: Response) {
  const template = await templateService.getTemplate(req.params.templateId);
  if (!template) return res.status(404).json({ error: "Not found" });
  return res.json(template);
}

export async function createTemplate(req: Request, res: Response) {
  const parsed = CreateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  const userId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const template = await templateService.createTemplate(req.params.projectId, userId, parsed.data);

  if (req.file) {
    const s3_key = `templates/${template.id}/${req.file.originalname}`;
    await uploadToS3(s3_key, req.file.buffer, req.file.mimetype);
    template.s3_key = s3_key;
    const { AppDataSource } = await import("../configs/data-source.config");
    const { DocumentTemplate } = await import("../entities/DocumentTemplate.entity");
    await AppDataSource.getRepository(DocumentTemplate).save(template);
  }

  return res.status(201).json(template);
}

export async function patchTemplate(req: Request, res: Response) {
  const parsed = PatchTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await templateService.patchTemplate(req.params.templateId, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteTemplate(req: Request, res: Response) {
  const template = await templateService.getTemplate(req.params.templateId);
  if (!template) return res.status(404).json({ error: "Not found" });
  await templateService.deleteTemplate(req.params.templateId);
  res.status(204).send();
}
