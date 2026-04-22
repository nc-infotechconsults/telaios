import { AppDataSource } from "../configs/data-source.config";
import { ProjectAgent } from "../entities/ProjectAgent.entity";
import { LibraryAgent } from "../entities/LibraryAgent.entity";
import { encrypt } from "../utils/crypto.util";
import type { CreateProjectAgentDto, PatchProjectAgentDto } from "../schemas/projectAgent.schema";

const repo = () => AppDataSource.getRepository(ProjectAgent);
const libraryRepo = () => AppDataSource.getRepository(LibraryAgent);

function encryptKey(dto: Record<string, unknown>) {
  const out = { ...dto };
  if (out.llm_api_key && typeof out.llm_api_key === "string") {
    out.llm_api_key = encrypt(out.llm_api_key);
  }
  return out;
}

export async function listProjectAgents(projectId: string): Promise<ProjectAgent[]> {
  return repo().find({
    where: { project_id: projectId },
    order: { created_at: "ASC" },
  });
}

/**
 * Returns project agents with raw encrypted llm_api_key values.
 * For internal agent-service consumption only.
 */
export async function listProjectAgentsRaw(projectId: string): Promise<ProjectAgent[]> {
  return repo().find({
    where: { project_id: projectId },
    order: { created_at: "ASC" },
  });
}

/**
 * Clones a LibraryAgent into a project as an independent ProjectAgent copy.
 * Increments library_agent usage_count is deferred to task execution, not here.
 */
export async function cloneFromLibrary(
  projectId: string,
  libraryAgentId: string,
): Promise<ProjectAgent> {
  const template = await libraryRepo().findOne({ where: { id: libraryAgentId } });
  if (!template) {
    throw Object.assign(new Error("Library agent not found"), { statusCode: 404 });
  }

  const agent = repo().create({
    project_id: projectId,
    library_agent_id: libraryAgentId,
    name: template.name,
    role: template.role as ProjectAgent["role"] ?? "custom",
    system_prompt: template.system_prompt,
    system_prompt_mode: template.system_prompt_mode,
    llm_provider: template.llm_provider,
    llm_model: template.llm_model,
    llm_api_key: null,
    llm_base_url: null,
    llm_temperature: template.llm_temperature,
    llm_max_tokens: template.llm_max_tokens,
    sub_agents: template.sub_agents,
    mcp_servers: template.mcp_servers,
    skills: template.skills,
    structured_output: template.structured_output,
    scope: null,
  });

  return repo().save(agent);
}

export async function createProjectAgent(
  projectId: string,
  dto: CreateProjectAgentDto,
): Promise<ProjectAgent> {
  const data = encryptKey(dto as Record<string, unknown>);
  const agent = repo().create({ ...data, project_id: projectId } as Partial<ProjectAgent>);
  return repo().save(agent);
}

export async function updateProjectAgent(
  projectId: string,
  agentId: string,
  dto: PatchProjectAgentDto,
): Promise<ProjectAgent | null> {
  const agent = await repo().findOneBy({ id: agentId, project_id: projectId });
  if (!agent) return null;

  const data = encryptKey(dto as Record<string, unknown>);
  Object.assign(agent, data);
  return repo().save(agent);
}

export async function removeProjectAgent(
  projectId: string,
  agentId: string,
): Promise<void> {
  await repo().delete({ id: agentId, project_id: projectId });
}
