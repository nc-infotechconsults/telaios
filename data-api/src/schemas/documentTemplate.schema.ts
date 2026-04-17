import { z } from "zod";
import { DocumentFileTypeSchema } from "./document.schema";

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional().default(null),
  file_type: DocumentFileTypeSchema,
  category: z.string().max(100).nullable().optional().default(null),
  is_global: z.boolean().optional().default(true),
});

export const PatchTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  file_type: DocumentFileTypeSchema.optional(),
  category: z.string().max(100).nullable().optional(),
  is_global: z.boolean().optional(),
});

export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>;
export type PatchTemplateDto = z.infer<typeof PatchTemplateSchema>;
