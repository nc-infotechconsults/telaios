import { z } from "zod";

export const ArtifactTypeSchema = z.enum([
  "diff",
  "test_result",
  "review",
  "log",
  "file",
  "link",
]);

export const CreateTaskArtifactSchema = z.object({
  type: ArtifactTypeSchema,
  title: z.string().min(1),
  content: z.string(),
  content_type: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const BulkCreateTaskArtifactsSchema = z.object({
  artifacts: z.array(CreateTaskArtifactSchema).min(1),
});

export const TaskArtifactResponseSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  type: ArtifactTypeSchema,
  title: z.string(),
  content: z.string(),
  content_type: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  sort_order: z.number(),
  created_at: z.string(),
});

export type CreateTaskArtifactDto = z.infer<typeof CreateTaskArtifactSchema>;
export type BulkCreateTaskArtifactsDto = z.infer<typeof BulkCreateTaskArtifactsSchema>;
export type TaskArtifactResponseDto = z.infer<typeof TaskArtifactResponseSchema>;
