import type { Request, Response } from "express";
import { RegisterSchema, LoginSchema } from "../schemas/auth.schema";
import * as authService from "../services/auth.service";

export async function register(req: Request, res: Response) {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const result = await authService.register(parsed.data);
  return res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const result = await authService.login(parsed.data);
  return res.json(result);
}

export async function me(req: Request, res: Response) {
  return res.json(authService.sanitizeUser(req.user!));
}
