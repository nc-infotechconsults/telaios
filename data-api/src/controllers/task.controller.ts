import type { Request, Response } from "express";
import { CreateTaskSchema, PatchTaskSchema } from "../schemas/task.schema";
import * as taskService from "../services/task.service";

export async function listTasks(req: Request, res: Response) {
  const planId = req.query.plan_id as string | undefined;
  const tasks = await taskService.listTasks(planId);
  res.json(tasks);
}

export async function createTask(req: Request, res: Response) {
  const parsed = CreateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const task = await taskService.createTask(parsed.data);
  return res.status(201).json(task);
}

export async function getTask(req: Request, res: Response) {
  const task = await taskService.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Not found" });
  return res.json(task);
}

export async function patchTask(req: Request, res: Response) {
  const parsed = PatchTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await taskService.patchTask(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function retryTask(req: Request, res: Response) {
  try {
    const updated = await taskService.retryTask(req.params.id);
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(409).json({ error: message });
  }
}

export async function cancelTask(req: Request, res: Response) {
  try {
    const updated = await taskService.cancelTask(req.params.id);
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(409).json({ error: message });
  }
}
