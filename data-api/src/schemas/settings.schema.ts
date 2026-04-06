import { z } from "zod";

export const PutSettingsSchema = z.object({
  llm_provider: z.string().optional(),
  llm_model: z.string().optional(),
  llm_api_key_raw: z.string().optional(),
  llm_base_url: z.string().optional(),
});

export type PutSettingsDto = z.infer<typeof PutSettingsSchema>;
