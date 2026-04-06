import { z } from "zod";

export const AgentTypeSchema = z.enum(["langgraph", "opencode", "github-copilot"]);

const McpServerSchema = z.object({
  name: z.string(),
  transport: z.enum(["stdio", "streamable-http"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
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
});

export const PatchAgentProfileSchema = CreateAgentProfileSchema.partial();

export type CreateAgentProfileDto = z.infer<typeof CreateAgentProfileSchema>;
export type PatchAgentProfileDto = z.infer<typeof PatchAgentProfileSchema>;
