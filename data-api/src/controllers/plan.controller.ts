import type { Request, Response } from "express";
import { CreatePlanSchema, PatchPlanSchema } from "../schemas/plan.schema";
import * as planService from "../services/plan.service";
import * as messageService from "../services/message.service";
import * as taskService from "../services/task.service";

export async function listPlans(req: Request, res: Response) {
  const projectId = req.query.project_id as string | undefined;
  const plans = await planService.listPlans(projectId);
  res.json(plans);
}

export async function createPlan(req: Request, res: Response) {
  const parsed = CreatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const plan = await planService.createPlan(parsed.data);
  return res.status(201).json(plan);
}

export async function getPlan(req: Request, res: Response) {
  const plan = await planService.getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: "Not found" });
  return res.json(plan);
}

export async function patchPlan(req: Request, res: Response) {
  const parsed = PatchPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await planService.patchPlan(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deletePlanTasks(req: Request, res: Response) {
  const count = await taskService.deleteTasksByPlanId(req.params.id);
  return res.json({ deleted: count });
}

export async function getPlanMessages(req: Request, res: Response) {
  const messages = await messageService.listMessages({ planId: req.params.id });
  res.json(messages);
}
