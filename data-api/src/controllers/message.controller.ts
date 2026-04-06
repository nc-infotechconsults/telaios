import type { Request, Response } from "express";
import { CreateMessageSchema } from "../schemas/message.schema";
import * as messageService from "../services/message.service";

export async function listMessages(req: Request, res: Response) {
  const projectId = req.query.project_id as string | undefined;
  const planId = req.query.plan_id as string | undefined;
  const messages = await messageService.listMessages({ projectId, planId });
  res.json(messages);
}

export async function createMessage(req: Request, res: Response) {
  const parsed = CreateMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const msg = await messageService.createMessage(parsed.data);
  return res.status(201).json(msg);
}
