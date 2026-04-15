import type { Request, Response } from "express";
import * as artifactService from "../services/task_artifact.service";

export async function listTaskArtifacts(req: Request, res: Response) {
  const artifacts = await artifactService.findArtifactsByTaskId(req.params.id);
  return res.json(artifacts);
}
