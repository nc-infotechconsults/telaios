import type { Request, Response } from "express";
import {
  CreateLibraryAgentSchema,
  PatchLibraryAgentSchema,
  LibraryAgentQuerySchema,
} from "../schemas/libraryAgent.schema";
import {
  CreateLibraryMcpSchema,
  PatchLibraryMcpSchema,
  LibraryMcpQuerySchema,
} from "../schemas/libraryMcp.schema";
import {
  CreateLibrarySkillSchema,
  PatchLibrarySkillSchema,
  LibrarySkillQuerySchema,
} from "../schemas/librarySkill.schema";
import * as libraryAgentService from "../services/libraryAgent.service";
import * as libraryMcpService from "../services/libraryMcp.service";
import * as librarySkillService from "../services/librarySkill.service";

// ─── Library Agents ───────────────────────────────────────────────────────────

export async function listLibraryAgents(req: Request, res: Response) {
  const parsed = LibraryAgentQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const result = await libraryAgentService.listLibraryAgents(parsed.data);
  return res.json(result);
}

export async function getLibraryAgent(req: Request, res: Response) {
  const agent = await libraryAgentService.getLibraryAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "Not found" });
  return res.json(agent);
}

export async function createLibraryAgent(req: Request, res: Response) {
  const parsed = CreateLibraryAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  const agent = await libraryAgentService.createLibraryAgent(parsed.data, userId);
  return res.status(201).json(agent);
}

export async function updateLibraryAgent(req: Request, res: Response) {
  const parsed = PatchLibraryAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await libraryAgentService.updateLibraryAgent(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteLibraryAgent(req: Request, res: Response) {
  const deleted = await libraryAgentService.deleteLibraryAgent(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  return res.status(204).send();
}

// ─── Library MCPs ─────────────────────────────────────────────────────────────

export async function listLibraryMcps(req: Request, res: Response) {
  const parsed = LibraryMcpQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const result = await libraryMcpService.listLibraryMcps(parsed.data);
  return res.json(result);
}

export async function getLibraryMcp(req: Request, res: Response) {
  const mcp = await libraryMcpService.getLibraryMcp(req.params.id);
  if (!mcp) return res.status(404).json({ error: "Not found" });
  return res.json(mcp);
}

export async function createLibraryMcp(req: Request, res: Response) {
  const parsed = CreateLibraryMcpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  const mcp = await libraryMcpService.createLibraryMcp(parsed.data, userId);
  return res.status(201).json(mcp);
}

export async function updateLibraryMcp(req: Request, res: Response) {
  const parsed = PatchLibraryMcpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await libraryMcpService.updateLibraryMcp(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteLibraryMcp(req: Request, res: Response) {
  const deleted = await libraryMcpService.deleteLibraryMcp(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  return res.status(204).send();
}

// ─── Library Skills ───────────────────────────────────────────────────────────

export async function listLibrarySkills(req: Request, res: Response) {
  const parsed = LibrarySkillQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const result = await librarySkillService.listLibrarySkills(parsed.data);
  return res.json(result);
}

export async function getLibrarySkill(req: Request, res: Response) {
  const skill = await librarySkillService.getLibrarySkill(req.params.id);
  if (!skill) return res.status(404).json({ error: "Not found" });
  return res.json(skill);
}

export async function createLibrarySkill(req: Request, res: Response) {
  const parsed = CreateLibrarySkillSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  const skill = await librarySkillService.createLibrarySkill(parsed.data, userId);
  return res.status(201).json(skill);
}

export async function updateLibrarySkill(req: Request, res: Response) {
  const parsed = PatchLibrarySkillSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await librarySkillService.updateLibrarySkill(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteLibrarySkill(req: Request, res: Response) {
  const deleted = await librarySkillService.deleteLibrarySkill(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  return res.status(204).send();
}

export async function exportLibrarySkill(req: Request, res: Response) {
  const result = await librarySkillService.exportLibrarySkillAsZip(req.params.id);
  if (!result) return res.status(404).json({ error: "Not found" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${result.slug}.zip"`);
  return res.send(result.buffer);
}
