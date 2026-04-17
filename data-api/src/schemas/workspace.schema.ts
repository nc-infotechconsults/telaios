import { z } from "zod";

export const WorkspaceStatusSchema = z.enum(["idle", "starting", "running", "sleeping", "error"]);

export const WorkspaceConfigSchema = z.object({
  repositories: z.record(
    z.string(),
    z.object({
      branch: z.string().optional(),
      enabled: z.boolean().optional(),
    }),
  ).optional(),
  env_vars: z.record(z.string(), z.string()).optional(),
  devcontainer_overrides: z.object({
    image: z.string().optional(),
    postCreateCommand: z.string().optional(),
    extensions: z.array(z.string()).optional(),
  }).optional(),
  default_open_files: z.array(z.string()).optional(),
  agent_profile_id: z.string().optional(),
});

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1),
  config: WorkspaceConfigSchema.optional(),
});

export const PatchWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  status: WorkspaceStatusSchema.optional(),
  container_id: z.string().optional(),
  container_image: z.string().optional(),
  ide_url: z.string().optional(),
  ide_workspace_id: z.string().optional(),
  config: WorkspaceConfigSchema.optional(),
});

export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceSchema>;
export type PatchWorkspaceDto = z.infer<typeof PatchWorkspaceSchema>;
