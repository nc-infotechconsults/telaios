import type { Request, Response } from "express";
import * as analyticsService from "../services/analytics.service";

export async function getProjectAnalytics(req: Request, res: Response) {
  const projectId = req.params.projectId;
  const days = analyticsService.parsePeriodDays(req.query.period);
  const data = await analyticsService.getProjectAnalytics(projectId, days);
  return res.json(data);
}

export async function getProjectDocAnalytics(req: Request, res: Response) {
  const projectId = req.params.projectId;
  const days = analyticsService.parsePeriodDays(req.query.period);
  const data = await analyticsService.getProjectDocumentAnalytics(projectId, days);
  return res.json(data);
}

export async function getOrgAnalytics(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  const isAdmin = req.user.system_role === "admin";
  const data = await analyticsService.getOrgAnalytics(req.user.id, isAdmin);
  return res.json(data);
}
