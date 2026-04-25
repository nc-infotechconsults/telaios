import { z } from "zod";

export const ProjectStatusSchema = z.enum(["planning", "executing", "done"]);

export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: ProjectStatusSchema.optional(),
});

export const PatchProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: ProjectStatusSchema.optional(),
});

export const ProjectQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
export type PatchProjectDto = z.infer<typeof PatchProjectSchema>;
export type ProjectQueryDto = z.infer<typeof ProjectQuerySchema>;
