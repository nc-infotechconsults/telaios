import { z } from "zod";

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default("#3B82F6"),
});

export const PatchTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export type CreateTagDto = z.infer<typeof CreateTagSchema>;
export type PatchTagDto = z.infer<typeof PatchTagSchema>;
