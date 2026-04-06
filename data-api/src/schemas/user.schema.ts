import { z } from "zod";

export const SystemRoleSchema = z.enum(["admin", "member"]);

export const PatchUserSchema = z.object({
  display_name: z.string().min(1).optional(),
  system_role: SystemRoleSchema.optional(),
  is_active: z.boolean().optional(),
});

export type PatchUserDto = z.infer<typeof PatchUserSchema>;
