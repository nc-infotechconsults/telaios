import { AppDataSource } from "../configs/data-source.config";
import { LibraryAgent } from "../entities/LibraryAgent.entity";
import { encrypt, decrypt } from "../utils/crypto.util";
import type { CreateAgentProfileDto, PatchAgentProfileDto } from "../schemas/agentProfile.schema";

/**
 * The /agent-profiles API now delegates to LibraryAgent, which supersedes the
 * old AgentProfile entity. Field mapping adapts the LibraryAgent shape to the
 * AgentProfile API contract that the frontend relies on.
 */
const repo = () => AppDataSource.getRepository(LibraryAgent);

function sanitize(a: LibraryAgent) {
  return {
    id: a.id,
    name: a.name,
    description: a.description ?? "",
    agent_type: a.agent_type,
    llm_provider: a.llm_provider ?? undefined,
    llm_model: a.llm_model ?? undefined,
    has_llm_api_key: !!(a.llm_api_key && decrypt(a.llm_api_key)),
    has_github_token: false,
    llm_temperature: a.llm_temperature ?? undefined,
    llm_max_tokens: a.llm_max_tokens ?? undefined,
    system_prompt: a.system_prompt,
    // LibraryAgent uses "append"; the old AgentProfile used "extend" for the same concept
    system_prompt_mode: (a.system_prompt_mode === "append" ? "extend" : "override") as "override" | "extend",
    sub_agent_ids: a.sub_agents.map((s) => s.agent_id),
    structured_output: a.structured_output,
    mcp_servers: a.mcp_servers,
    skills: a.skills,
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
}

export async function listAgentProfiles() {
  const agents = await repo().find({ order: { name: "ASC" } });
  return agents.map(sanitize);
}

/**
 * Returns agents with raw encrypted keys — for internal agent-service consumption only.
 * Never expose this on a public/user-facing endpoint.
 */
export async function listAgentProfilesRaw() {
  return repo().find({ order: { name: "ASC" } });
}

export async function createAgentProfile(dto: CreateAgentProfileDto) {
  // Auto-generate a slug from the name since LibraryAgent requires one
  const slug =
    dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    Date.now();

  const agent = repo().create({
    name: dto.name,
    slug,
    description: dto.description ?? null,
    agent_type: "custom",
    llm_provider: dto.llm_provider ?? null,
    llm_model: dto.llm_model ?? null,
    llm_api_key: dto.llm_api_key ? encrypt(dto.llm_api_key) : null,
    llm_temperature: dto.llm_temperature ?? null,
    llm_max_tokens: dto.llm_max_tokens ?? null,
    system_prompt: dto.system_prompt ?? null,
    system_prompt_mode: dto.system_prompt_mode === "extend" ? "append" : "override",
    sub_agents: (dto.sub_agent_ids ?? []).map((id) => ({
      agent_id: id,
      tool_name: "",
      tool_description: "",
    })),
    structured_output: dto.structured_output as LibraryAgent["structured_output"] ?? null,
    mcp_servers: (dto.mcp_servers ?? []) as LibraryAgent["mcp_servers"],
    skills: (dto.skills ?? []).map((s) => ({
      name: s.name,
      description: s.description,
      content: s.instructions,
    })),
  });
  return sanitize(await repo().save(agent));
}

export async function getAgentProfile(id: string) {
  const agent = await repo().findOne({ where: { id } });
  return agent ? sanitize(agent) : null;
}

export async function patchAgentProfile(id: string, dto: PatchAgentProfileDto) {
  const agent = await repo().findOne({ where: { id } });
  if (!agent) return null;

  if (dto.name !== undefined) agent.name = dto.name;
  if (dto.description !== undefined) agent.description = dto.description ?? null;
  if (dto.llm_provider !== undefined) agent.llm_provider = dto.llm_provider ?? null;
  if (dto.llm_model !== undefined) agent.llm_model = dto.llm_model ?? null;
  if (dto.llm_api_key !== undefined) agent.llm_api_key = dto.llm_api_key ? encrypt(dto.llm_api_key) : null;
  if (dto.llm_temperature !== undefined) agent.llm_temperature = dto.llm_temperature ?? null;
  if (dto.llm_max_tokens !== undefined) agent.llm_max_tokens = dto.llm_max_tokens ?? null;
  if (dto.system_prompt !== undefined) agent.system_prompt = dto.system_prompt ?? null;
  if (dto.system_prompt_mode !== undefined) {
    agent.system_prompt_mode = dto.system_prompt_mode === "extend" ? "append" : "override";
  }
  if (dto.sub_agent_ids !== undefined) {
    agent.sub_agents = dto.sub_agent_ids.map((aid) => ({
      agent_id: aid,
      tool_name: "",
      tool_description: "",
    }));
  }
  if (dto.structured_output !== undefined) agent.structured_output = dto.structured_output as LibraryAgent["structured_output"] ?? null;
  if (dto.mcp_servers !== undefined) agent.mcp_servers = dto.mcp_servers as LibraryAgent["mcp_servers"];
  if (dto.skills !== undefined) {
    agent.skills = dto.skills.map((s) => ({
      name: s.name,
      description: s.description,
      content: s.instructions,
    }));
  }

  return sanitize(await repo().save(agent));
}

export async function deleteAgentProfile(id: string): Promise<void> {
  await repo().softDelete(id);
}
