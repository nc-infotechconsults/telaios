import { z } from "zod";

export const CreateVersionSchema = z.object({
  change_description: z.string().max(500).nullable().optional().default(null),
});

export type CreateVersionDto = z.infer<typeof CreateVersionSchema>;
