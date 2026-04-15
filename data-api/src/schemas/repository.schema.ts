import { z } from "zod";

export const RepositoryAuthTypeSchema = z.enum(["none", "token", "ssh"]);
export const RepositoryStatusSchema = z.enum(["unconfigured", "cloning", "ready", "error"]);

export const RepositorySourceTypeSchema = z.enum(["remote", "local"]);

export const CreateRepositorySchema = z.object({
  name: z.string().min(1),
  source_type: RepositorySourceTypeSchema.optional(),
  remote_url: z.string().optional(),
  branch: z.string().optional(),
  auth_type: RepositoryAuthTypeSchema.optional(),
  credentials: z.string().optional(),
  local_path: z.string().optional(),
});

export const PatchRepositorySchema = z.object({
  name: z.string().min(1).optional(),
  source_type: RepositorySourceTypeSchema.optional(),
  remote_url: z.string().optional(),
  branch: z.string().optional(),
  auth_type: RepositoryAuthTypeSchema.optional(),
  credentials: z.string().optional(),
  local_path: z.string().optional(),
  status: RepositoryStatusSchema.optional(),
  error_message: z.string().optional(),
});

export type RepositorySourceTypeDto = z.infer<typeof RepositorySourceTypeSchema>;
export type CreateRepositoryDto = z.infer<typeof CreateRepositorySchema>;
export type PatchRepositoryDto = z.infer<typeof PatchRepositorySchema>;
