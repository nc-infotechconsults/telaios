import { z } from "zod";

export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);

export const CreateMessageSchema = z.object({
  project_id: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string().min(1),
});

export type CreateMessageDto = z.infer<typeof CreateMessageSchema>;
