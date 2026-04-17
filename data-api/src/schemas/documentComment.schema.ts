import { z } from "zod";

export const AnchorTypeSchema = z.enum(["page", "cell", "text_range", "general"]);

export const CreateCommentSchema = z.object({
  content: z.string().min(1),
  anchor_type: AnchorTypeSchema.optional().default("general"),
  anchor_data: z.record(z.string(), z.unknown()).nullable().optional().default(null),
  parent_comment_id: z.string().uuid().nullable().optional().default(null),
});

export const PatchCommentSchema = z.object({
  content: z.string().min(1).optional(),
  resolved: z.boolean().optional(),
});

export type CreateCommentDto = z.infer<typeof CreateCommentSchema>;
export type PatchCommentDto = z.infer<typeof PatchCommentSchema>;
