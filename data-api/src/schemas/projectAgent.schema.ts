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

export const AgentRoleSchema = z.enum([
  "planner",
  "coder",
  "reviewer",
  "tester",
  "infra",
  "knowledge",
  "custom",
  "document-copilot",
]);

export const CreateProjectAgentSchema = z.object({
  name: z.string().min(1),
  role: AgentRoleSchema,
  system_prompt: z.string().nullable().optional(),
  system_prompt_mode: z.enum(["append", "override"]).optional(),
  llm_provider: z.string().optional(),
  llm_model: z.string().optional(),
  llm_api_key: z.string().nullable().optional(),
  llm_base_url: z.string().nullable().optional(),
  llm_temperature: z.number().min(0).max(2).nullable().optional(),
  llm_max_tokens: z.number().int().positive().nullable().optional(),
  sub_agents: z.array(SubAgentEntrySchema).optional(),
  mcp_servers: z.array(McpServerSchema).optional(),
  skills: z.array(InlineSkillSchema).optional(),
  structured_output: JsonSchemaObject,
  scope: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const PatchProjectAgentSchema = CreateProjectAgentSchema.partial();

export type CreateProjectAgentDto = z.infer<typeof CreateProjectAgentSchema>;
export type PatchProjectAgentDto = z.infer<typeof PatchProjectAgentSchema>;
