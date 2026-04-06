import { z } from "zod";

export const ProjectRoleSchema = z.enum(["owner", "editor", "viewer"]);

export const AddMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: ProjectRoleSchema.optional().default("viewer"),
});

export const PatchMemberSchema = z.object({
  role: ProjectRoleSchema,
});

export type AddMemberDto = z.infer<typeof AddMemberSchema>;
export type PatchMemberDto = z.infer<typeof PatchMemberSchema>;
