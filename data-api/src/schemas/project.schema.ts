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

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
export type PatchProjectDto = z.infer<typeof PatchProjectSchema>;
