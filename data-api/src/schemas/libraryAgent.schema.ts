import { z } from "zod";

const McpToolPermissionSchema = z.enum(["read", "write", "execute", "require-confirmation"]);

const McpToolConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  allowed: z.boolean(),
  permissions: z.array(McpToolPermissionSchema).optional(),
});

const McpServerSchema = z.object({
  name: z.string(),
  transport: z.enum(["stdio", "streamable-http"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  tools: z.array(McpToolConfigSchema).optional(),
});

const InlineSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
});

const SubAgentEntrySchema = z.object({
  agent_id: z.string().uuid(),
  tool_name: z.string().min(1),
  tool_description: z.string().min(1),
});

const JsonSchemaObject = z
  .object({
    type: z.literal("object"),
    properties: z.record(z.string(), z.unknown()).optional(),
    required: z.array(z.string()).optional(),
  })
  .nullable()
  .optional();

export const CreateLibraryAgentSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  description: z.string().optional(),
  role: z.string().optional(),
  system_prompt: z.string().nullable().optional(),
  system_prompt_mode: z.enum(["append", "override"]).optional(),
  llm_provider: z.string().nullable().optional(),
  llm_model: z.string().nullable().optional(),
  llm_api_key: z.string().nullable().optional(),
  llm_temperature: z.number().min(0).max(2).nullable().optional(),
  llm_max_tokens: z.number().int().positive().nullable().optional(),
  sub_agents: z.array(SubAgentEntrySchema).optional(),
  mcp_servers: z.array(McpServerSchema).optional(),
  skills: z.array(InlineSkillSchema).optional(),
  structured_output: JsonSchemaObject,
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
});

export const PatchLibraryAgentSchema = CreateLibraryAgentSchema.partial().omit({ slug: true });

export const LibraryAgentQuerySchema = z.object({
  q: z.string().optional(),
  role: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type CreateLibraryAgentDto = z.infer<typeof CreateLibraryAgentSchema>;
export type PatchLibraryAgentDto = z.infer<typeof PatchLibraryAgentSchema>;
export type LibraryAgentQueryDto = z.infer<typeof LibraryAgentQuerySchema>;
