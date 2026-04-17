import type { Request, Response } from "express";
import { CreateWorkspaceSchema, PatchWorkspaceSchema } from "../schemas/workspace.schema";
import * as workspaceService from "../services/workspace.service";

export async function listWorkspaces(req: Request, res: Response) {
  const workspaces = await workspaceService.listWorkspacesByProject(req.params.projectId);
  return res.json(workspaces);
}

export async function createWorkspace(req: Request, res: Response) {
  const parsed = CreateWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const workspace = await workspaceService.createWorkspace(
    req.params.projectId,
    parsed.data,
    req.user?.id,
  );
  return res.status(201).json(workspace);
}

export async function getWorkspace(req: Request, res: Response) {
  const workspace = await workspaceService.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ error: "Not found" });
  return res.json(workspace);
}

export async function patchWorkspace(req: Request, res: Response) {
  const parsed = PatchWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await workspaceService.patchWorkspace(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteWorkspace(req: Request, res: Response) {
  await workspaceService.deleteWorkspace(req.params.id);
  return res.status(204).send();
}

export async function launchWorkspace(req: Request, res: Response) {
  const workspace = await workspaceService.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ error: "Not found" });

  const ideServerUrl = process.env.IDE_SERVER_URL;
  if (!ideServerUrl) {
    return res.status(503).json({ error: "IDE server not configured (IDE_SERVER_URL missing)" });
  }

  // Call the IDE server to create/start a platform-project workspace
  const token = req.headers.authorization?.slice(7);
  const platformApiUrl = process.env.PUBLIC_API_URL ?? `http://localhost:3000`;

  try {
    const { default: axios } = await import("axios");
    const response = await axios.post(
      `${ideServerUrl}/api/workspaces/from-project`,
      {
        project_id: workspace.project_id,
        workspace_id: workspace.id,
        workspace_name: workspace.name,
        config: workspace.config,
        platform_api_url: platformApiUrl,
        token,
      },
      { timeout: 30_000 },
    );
    const { ide_workspace_id, ide_url } = response.data as { ide_workspace_id: string; ide_url: string };
    const updated = await workspaceService.patchWorkspace(workspace.id, {
      ide_workspace_id,
      ide_url,
      status: "starting",
    });
    return res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to launch workspace";
    return res.status(502).json({ error: msg });
  }
}
