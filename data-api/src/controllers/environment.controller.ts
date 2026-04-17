import type { Request, Response } from "express";
import {
  CreateEnvironmentSchema,
  PatchEnvironmentSchema,
  InstallHelmChartSchema,
} from "../schemas/environment.schema";
import * as envService from "../services/environment.service";

export async function listEnvironments(req: Request, res: Response) {
  const envs = await envService.listEnvironmentsByProject(req.params.projectId);
  return res.json(envs);
}

export async function createEnvironment(req: Request, res: Response) {
  const parsed = CreateEnvironmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const env = await envService.createEnvironment(req.params.projectId, parsed.data, req.user?.id);
  return res.status(201).json(env);
}

export async function getEnvironment(req: Request, res: Response) {
  const env = await envService.getEnvironment(req.params.id);
  if (!env) return res.status(404).json({ error: "Not found" });
  return res.json(env);
}

export async function patchEnvironment(req: Request, res: Response) {
  const parsed = PatchEnvironmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await envService.patchEnvironment(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteEnvironment(req: Request, res: Response) {
  await envService.deleteEnvironment(req.params.id);
  return res.status(204).send();
}

export async function testEnvironmentConnection(req: Request, res: Response) {
  const result = await envService.testEnvironmentConnection(req.params.id);
  return res.json(result);
}

export async function listResources(req: Request, res: Response) {
  const { kind = "pods", namespace = "default" } = req.query as Record<string, string>;
  const resources = await envService.listResources(req.params.id, namespace, kind);
  return res.json(resources);
}

export async function getResource(req: Request, res: Response) {
  const { namespace = "default" } = req.query as Record<string, string>;
  const resource = await envService.getResource(req.params.id, namespace, req.params.kind, req.params.name);
  if (!resource) return res.status(404).json({ error: "Not found" });
  return res.json(resource);
}

export async function getResourceLogs(req: Request, res: Response) {
  const { namespace = "default", container } = req.query as Record<string, string>;
  const logs = await envService.getResourceLogs(req.params.id, namespace, req.params.name, container);
  res.setHeader("Content-Type", "text/plain");
  return res.send(logs);
}

export async function installHelmChart(req: Request, res: Response) {
  const parsed = InstallHelmChartSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const env = await envService.getEnvironment(req.params.id);
  if (!env) return res.status(404).json({ error: "Not found" });

  const release = await envService.installHelmChart(
    req.params.id,
    env.project_id,
    parsed.data,
    req.user?.id,
  );
  return res.status(201).json(release);
}

export async function listHelmReleases(req: Request, res: Response) {
  const releases = await envService.listHelmReleases(req.params.id);
  return res.json(releases);
}

export async function uninstallHelmRelease(req: Request, res: Response) {
  await envService.uninstallHelmRelease(req.params.id, req.params.releaseName);
  return res.status(204).send();
}

export async function scanProjectCharts(req: Request, res: Response) {
  const env = await envService.getEnvironment(req.params.id);
  if (!env) return res.status(404).json({ error: "Not found" });
  const charts = await envService.scanProjectCharts(env.project_id);
  return res.json(charts);
}
