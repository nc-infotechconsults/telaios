import { z } from "zod";

export const TaskTypeSchema = z.enum(["code", "test", "review", "general", "knowledge", "infra"]);
export const TaskStatusSchema = z.enum(["pending", "ready", "in_progress", "done", "failed", "cancelled", "skipped"]);

export const CreateTaskSchema = z.object({
  plan_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  type: TaskTypeSchema.optional(),
  status: TaskStatusSchema.optional(),
  execution_order: z.number().int().min(0).optional(),
  agent_profile_id: z.string().uuid().optional(),
  repository_ids: z.array(z.string().uuid()).optional(),
  depends_on_task_ids: z.array(z.string().uuid()).optional(),
});

export const PatchTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  type: TaskTypeSchema.optional(),
  status: TaskStatusSchema.optional(),
  execution_order: z.number().int().min(0).optional(),
  agent_profile_id: z.string().uuid().nullable().optional(),
  assigned_instance_id: z.string().optional(),
  result: z.string().optional(),
  started_at: z.string().datetime({ offset: true }).nullable().optional(),
  completed_at: z.string().datetime({ offset: true }).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  repository_ids: z.array(z.string().uuid()).optional(),
  depends_on_task_ids: z.array(z.string().uuid()).optional(),
});

export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
export type PatchTaskDto = z.infer<typeof PatchTaskSchema>;
