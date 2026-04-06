import { z } from "zod";

export const PutSettingsSchema = z.object({
  llm_provider: z.string().optional(),
  llm_model: z.string().optional(),
  llm_api_key_raw: z.string().optional(),
  llm_base_url: z.string().optional(),
  llm_temperature: z.number().min(0).max(2).optional(),
  llm_max_tokens: z.number().int().positive().optional(),
  llm_top_p: z.number().min(0).max(1).optional(),
  llm_frequency_penalty: z.number().min(-2).max(2).optional(),
  llm_presence_penalty: z.number().min(-2).max(2).optional(),
});

export type PutSettingsDto = z.infer<typeof PutSettingsSchema>;
