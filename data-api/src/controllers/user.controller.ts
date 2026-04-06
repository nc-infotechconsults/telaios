import type { Request, Response } from "express";
import { PatchUserSchema } from "../schemas/user.schema";
import * as userService from "../services/user.service";

export async function listUsers(_req: Request, res: Response) {
  res.json(await userService.listUsers());
}

export async function getUser(req: Request, res: Response) {
  const user = await userService.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json(user);
}

export async function patchUser(req: Request, res: Response) {
  const parsed = PatchUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await userService.patchUser(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteUser(req: Request, res: Response) {
  await userService.deleteUser(req.params.id);
  res.status(204).send();
}
