import type { Request, Response, NextFunction } from "express";
import type { ProjectRole } from "../entities/ProjectMember.entity";
import { getMembership, hasMinRole } from "../services/projectMember.service";
import { AppDataSource } from "../configs/data-source.config";
import { Plan } from "../entities/Plan.entity";
import { Task } from "../entities/Task.entity";
import { Workspace } from "../entities/Workspace.entity";
import { Environment } from "../entities/Environment.entity";

async function resolveProjectId(req: Request): Promise<string | null> {
  // Direct project param
  if (req.params.projectId) return req.params.projectId;
  if (req.params.id && req.baseUrl?.includes("/projects")) return req.params.id;

  // Query string
  if (req.query.project_id) return req.query.project_id as string;

  // Plans: resolve via plan id
  if (req.baseUrl?.includes("/plans") && req.params.id) {
    const plan = await AppDataSource.getRepository(Plan).findOneBy({ id: req.params.id });
    return plan?.project_id ?? null;
  }

  // Tasks: resolve via task id → plan → project
  if (req.baseUrl?.includes("/tasks") && req.params.id) {
    const task = await AppDataSource.getRepository(Task).findOne({
      where: { id: req.params.id },
      relations: ["plan"],
    });
    return task?.plan?.project_id ?? null;
  }

  // Workspaces: resolve via workspace id → project (include soft-deleted so RBAC works post-delete)
  if (req.baseUrl?.includes("/workspaces") && req.params.id) {
    const workspace = await AppDataSource.getRepository(Workspace).findOne({
      where: { id: req.params.id },
      withDeleted: true,
    });
    return workspace?.project_id ?? null;
  }

  // Environments: resolve via environment id → project (include soft-deleted so RBAC works post-delete)
  if (req.baseUrl?.includes("/environments") && req.params.id) {
    const environment = await AppDataSource.getRepository(Environment).findOne({
      where: { id: req.params.id },
      withDeleted: true,
    });
    return environment?.project_id ?? null;
  }

  // Body
  if (req.body?.project_id) return req.body.project_id as string;
  if (req.body?.plan_id) {
    const plan = await AppDataSource.getRepository(Plan).findOneBy({ id: req.body.plan_id });
    return plan?.project_id ?? null;
  }

  return null;
}

export function requireProjectAccess(minRole: ProjectRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });

    // Admins bypass all project-level checks
    if (req.user.system_role === "admin") return next();

    const projectId = await resolveProjectId(req);
    if (!projectId) return res.status(403).json({ error: "Project context required" });

    const membership = await getMembership(req.user.id, projectId);
    if (!membership) return res.status(403).json({ error: "Not a member of this project" });

    if (!hasMinRole(membership.role, minRole)) {
      return res.status(403).json({ error: "Insufficient project role" });
    }

    return next();
  };
}
