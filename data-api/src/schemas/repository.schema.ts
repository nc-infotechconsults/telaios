import { z } from "zod";

export const RepositoryAuthTypeSchema = z.enum(["none", "token", "ssh"]);
export const RepositoryStatusSchema = z.enum(["unconfigured", "cloning", "ready", "error"]);

export const RepositoryProviderTypeSchema = z.enum(["github", "gitlab", "bitbucket", "git", "s3"]);

// Restrict name to safe filesystem characters — prevents path traversal when
// directory names are derived from this field (e.g. /workspaces/<project>/<name>).
const safeNameRegex = /^[a-zA-Z0-9_.-]+$/;
const safeName = z
  .string()
  .min(1)
  .max(100)
  .regex(safeNameRegex, "Name may only contain letters, digits, hyphens, underscores, and dots");

export const CreateRepositorySchema = z.object({
  name: safeName,
  provider_type: RepositoryProviderTypeSchema.optional(),
  remote_url: z.string().optional(),
  branch: z.string().optional(),
  auth_type: RepositoryAuthTypeSchema.optional(),
  credentials: z.string().optional(),
  bucket_name: z.string().optional(),
  region: z.string().optional(),
  endpoint: z.string().optional(),
});

export const PatchRepositorySchema = z.object({
  name: safeName.optional(),
  provider_type: RepositoryProviderTypeSchema.optional(),
  remote_url: z.string().optional(),
  branch: z.string().optional(),
  auth_type: RepositoryAuthTypeSchema.optional(),
  credentials: z.string().optional(),
  bucket_name: z.string().optional(),
  region: z.string().optional(),
  endpoint: z.string().optional(),
  status: RepositoryStatusSchema.optional(),
  error_message: z.string().optional(),
});

export const TestRepositorySchema = z.object({
  provider_type: RepositoryProviderTypeSchema,
  remote_url: z.string().optional(),
  branch: z.string().optional(),
  auth_type: RepositoryAuthTypeSchema.optional(),
  credentials: z.string().optional(),
  bucket_name: z.string().optional(),
  region: z.string().optional(),
  endpoint: z.string().optional(),
});

export type RepositoryProviderTypeDto = z.infer<typeof RepositoryProviderTypeSchema>;
export type CreateRepositoryDto = z.infer<typeof CreateRepositorySchema>;
export type PatchRepositoryDto = z.infer<typeof PatchRepositorySchema>;
export type TestRepositoryDto = z.infer<typeof TestRepositorySchema>;
