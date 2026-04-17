import { z } from "zod";

export const AgentRoleSchema = z.enum([
  "planner",
  "coder",
  "reviewer",
  "tester",
  "infra",
  "knowledge",
  "custom",
]);

export const AssignAgentSchema = z.object({
  agent_profile_id: z.string().uuid(),
  role: AgentRoleSchema,
  scope: z.record(z.string(), z.unknown()).nullable().optional().default(null),
});

export const PatchProjectAgentSchema = z.object({
  role: AgentRoleSchema.optional(),
  scope: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type AssignAgentDto = z.infer<typeof AssignAgentSchema>;
export type PatchProjectAgentDto = z.infer<typeof PatchProjectAgentSchema>;
