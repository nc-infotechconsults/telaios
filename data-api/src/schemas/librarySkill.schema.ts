import { z } from "zod";

/** A single supporting file embedded in the skill payload. */
export const SkillFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/]/, "path must not start with /")
    .regex(/^(?!.*\.\.)/, "path must not contain ..")
    .refine((p) => p !== "SKILL.md", "path must not be SKILL.md"),
  content: z.string(),
});

export const CreateLibrarySkillSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  description: z.string().optional(),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  skill_metadata: z.record(z.string(), z.string()).optional(),
  files: z.array(SkillFileSchema).optional(),
});

export const PatchLibrarySkillSchema = CreateLibrarySkillSchema.partial().omit({ slug: true });

export const LibrarySkillQuerySchema = z.object({
  q: z.string().optional(),
  tags: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type SkillFileDto = z.infer<typeof SkillFileSchema>;
export type CreateLibrarySkillDto = z.infer<typeof CreateLibrarySkillSchema>;
export type PatchLibrarySkillDto = z.infer<typeof PatchLibrarySkillSchema>;
export type LibrarySkillQueryDto = z.infer<typeof LibrarySkillQuerySchema>;
