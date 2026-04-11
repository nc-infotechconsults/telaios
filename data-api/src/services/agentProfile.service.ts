import { AppDataSource } from "../configs/data-source.config";
import { AgentProfile } from "../entities/AgentProfile.entity";
import { encrypt, decrypt } from "../utils/crypto.util";
import type { CreateAgentProfileDto, PatchAgentProfileDto } from "../schemas/agentProfile.schema";

const repo = () => AppDataSource.getRepository(AgentProfile);

function encryptSensitive(body: Record<string, unknown>) {
  const out = { ...body };
  if (out.llm_api_key) out.llm_api_key = encrypt(out.llm_api_key as string);
  if (out.github_token) out.github_token = encrypt(out.github_token as string);
  return out;
}

function sanitizeProfile(p: AgentProfile) {
  return {
    ...p,
    llm_api_key: decrypt(p.llm_api_key) ? "***" : "",
    github_token: decrypt(p.github_token) ? "***" : "",
  };
}

export async function listAgentProfiles() {
  const profiles = await repo().find({ order: { name: "ASC" } });
  return profiles.map(sanitizeProfile);
}

export async function createAgentProfile(dto: CreateAgentProfileDto) {
  const data = encryptSensitive(dto as Record<string, unknown>);
  const profile = await repo().save(repo().create(data as Partial<AgentProfile>));
  return sanitizeProfile(profile);
}

export async function getAgentProfile(id: string) {
  const profile = await repo().findOneBy({ id });
  return profile ? sanitizeProfile(profile) : null;
}

export async function patchAgentProfile(id: string, dto: PatchAgentProfileDto) {
  const data = encryptSensitive(dto as Record<string, unknown>);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await repo().update(id, data as any);
  const updated = await repo().findOneBy({ id });
  return updated ? sanitizeProfile(updated) : null;
}

export async function deleteAgentProfile(id: string): Promise<void> {
  await repo().softDelete(id);
}
