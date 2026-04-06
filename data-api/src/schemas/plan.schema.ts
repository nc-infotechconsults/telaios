import { z } from "zod";

export const PlanStatusSchema = z.enum(["draft", "confirmed", "executing", "completed"]);

export const CreatePlanSchema = z.object({
  project_id: z.string().uuid(),
  status: PlanStatusSchema.optional(),
});

export const PatchPlanSchema = z.object({
  status: PlanStatusSchema.optional(),
  confirmed_at: z.coerce.date().optional(),
});

export type CreatePlanDto = z.infer<typeof CreatePlanSchema>;
export type PatchPlanDto = z.infer<typeof PatchPlanSchema>;
