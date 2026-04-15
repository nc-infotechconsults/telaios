import { z } from "zod";

export const PlanStatusSchema = z.enum(["draft", "confirmed", "executing", "completed", "failed"]);

export const CreatePlanSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().optional(),
  status: PlanStatusSchema.optional(),
});

export const PatchPlanSchema = z.object({
  title: z.string().optional(),
  status: PlanStatusSchema.optional(),
  confirmed_at: z.coerce.date().optional(),
});

export type CreatePlanDto = z.infer<typeof CreatePlanSchema>;
export type PatchPlanDto = z.infer<typeof PatchPlanSchema>;
