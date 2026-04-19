import type { Request, Response } from "express";
import * as activityService from "../services/documentActivity.service";

export async function listDocumentActivities(req: Request, res: Response) {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const activities = await activityService.listActivities(req.params.documentId, limit);
  res.json(activities);
}

export async function listProjectActivities(req: Request, res: Response) {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const activities = await activityService.listProjectActivities(req.params.projectId, limit);
  res.json(activities);
}
