import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  WORKSPACES_ROOT: z.string().default("/tmp/ide-workspaces"),
  WORKSPACES_HOST_PATH: z.string().optional(),
  DISABLE_CONTAINERS: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  DEFAULT_CONTAINER_IMAGE: z
    .string()
    .default("ghcr.io/devcontainers/base:ubuntu"),
  SLEEP_TIMEOUT_MINUTES: z.coerce.number().default(30),
  PLATFORM_API_URL: z.string().url().optional(),
  AGENT_SERVICE_URL: z.string().url().optional(),
  PLATFORM_JWT_SECRET: z.string().optional(),
  CLIENT_URL: z.string().url().optional(),

  // OpenCode agent — choose one mode:
  // Mode A: Connect to an existing OpenCode server
  OPENCODE_SERVER_URL: z.string().url().optional(),
  // Mode B: Use a specific model when starting an embedded OpenCode instance
  OPENCODE_MODEL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  // WORKSPACES_HOST_PATH falls back to WORKSPACES_ROOT when not set
  WORKSPACES_HOST_PATH:
    parsed.data.WORKSPACES_HOST_PATH ?? parsed.data.WORKSPACES_ROOT,
} as const;

export type Config = typeof config;
