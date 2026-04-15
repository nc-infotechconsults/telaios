import * as dotenv from "dotenv";
dotenv.config();

import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(8000),
  DATA_API_URL: z.string().default("http://localhost:3000"),
  DATA_API_KEY: z.string().default(""),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ENCRYPTION_KEY: z.string().default("default-key-change-in-production!"),
  WORKSPACES_ROOT: z.string().default("/tmp/swe-ai-workspaces"),
  AGENT_POOL_SIZE: z.coerce.number().default(3),
  LLM_PROVIDER: z.string().default("openai"),
  LLM_MODEL: z.string().default("gpt-4o"),
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().optional(),
  // S3 / MinIO for document storage
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_ACCESS_KEY: z.string().default("sweai"),
  S3_SECRET_KEY: z.string().default("sweai-secret"),
  S3_BUCKET: z.string().default("sweai-documents"),
  S3_REGION: z.string().default("us-east-1"),
  // Embeddings model (OpenAI-compatible or local fastembed)
  // Default: BAAI/bge-small-en-v1.5 (384-dim, no API key required)
  // For OpenAI: set EMBEDDING_API_KEY and change to "text-embedding-3-small"
  EMBEDDING_MODEL: z.string().default("BAAI/bge-small-en-v1.5"),
  // Optional separate API key / base URL for embeddings (e.g. when LLM is Anthropic but embeddings use OpenAI)
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().optional(),
});

export const config = ConfigSchema.parse(process.env);
