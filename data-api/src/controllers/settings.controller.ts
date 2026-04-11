import type { Request, Response } from "express";
import { PatchSettingsSchema } from "../schemas/settings.schema";
import * as settingsService from "../services/settings.service";

export async function getSettings(_req: Request, res: Response) {
  const settings = await settingsService.getSettings();
  res.json(settings);
}

export async function getRawSettings(_req: Request, res: Response) {
  const settings = await settingsService.getRawSettings();
  res.json(settings);
}

export async function patchSettings(req: Request, res: Response) {
  const parsed = PatchSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await settingsService.patchSettings(parsed.data);
  return res.json(updated);
}
