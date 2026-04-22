import { z } from "zod";

export const AgentTypeSchema = z.enum(["langgraph", "opencode", "github-copilot"]);

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

const JsonSchemaPropertySchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

const SkillSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.string(), JsonSchemaPropertySchema).optional(),
    required: z.array(z.string()).optional(),
  }),
  outputSchema: z
    .object({
      type: z.literal("object"),
      properties: z.record(z.string(), JsonSchemaPropertySchema).optional(),
      required: z.array(z.string()).optional(),
    })
    .optional(),
  annotations: z
    .object({
      title: z.string().optional(),
      readOnlyHint: z.boolean().optional(),
      destructiveHint: z.boolean().optional(),
      idempotentHint: z.boolean().optional(),
      openWorldHint: z.boolean().optional(),
    })
    .optional(),
  instructions: z.string(),
});

export const CreateAgentProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  agent_type: AgentTypeSchema.optional(),
  llm_provider: z.string().optional(),
  llm_model: z.string().optional(),
  llm_api_key: z.string().optional(),
  llm_base_url: z.string().optional(),
  github_token: z.string().optional(),
  mcp_servers: z.array(McpServerSchema).optional(),
  skills: z.array(SkillSchema).optional(),
  system_prompt: z.string().nullable().optional(),
  system_prompt_mode: z.enum(["override", "extend"]).optional(),
  llm_temperature: z.number().min(0).max(2).nullable().optional(),
  llm_max_tokens: z.number().int().positive().nullable().optional(),
  llm_top_p: z.number().min(0).max(1).nullable().optional(),
  llm_frequency_penalty: z.number().min(-2).max(2).nullable().optional(),
  llm_presence_penalty: z.number().min(-2).max(2).nullable().optional(),
  sub_agent_ids: z.array(z.string().uuid()).optional(),
  structured_output: z
    .object({
      type: z.literal("object"),
      properties: z.record(z.string(), JsonSchemaPropertySchema).optional(),
      required: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
});

export const PatchAgentProfileSchema = CreateAgentProfileSchema.partial();

export type CreateAgentProfileDto = z.infer<typeof CreateAgentProfileSchema>;
export type PatchAgentProfileDto = z.infer<typeof PatchAgentProfileSchema>;
