import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(8000),
  DATA_API_URL: z.string().default("http://localhost:3000"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ENCRYPTION_KEY: z.string().default("default-key-change-in-production!"),
  WORKSPACES_ROOT: z.string().default("/tmp/swe-ai-workspaces"),
  AGENT_POOL_SIZE: z.coerce.number().default(3),
  LLM_PROVIDER: z.string().default("openai"),
  LLM_MODEL: z.string().default("gpt-4o"),
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().optional(),
});

export const config = ConfigSchema.parse(process.env);
