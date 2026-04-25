import { AppDataSource } from "../configs/data-source.config";
import { LibraryAgent } from "../entities/LibraryAgent.entity";
import { encrypt, decrypt } from "../utils/crypto.util";
import type { FindOptionsWhere } from "typeorm";
import type {
  CreateLibraryAgentDto,
  PatchLibraryAgentDto,
  LibraryAgentQueryDto,
} from "../schemas/libraryAgent.schema";

const repo = () => AppDataSource.getRepository(LibraryAgent);

function encryptSensitive(body: Record<string, unknown>) {
  const out = { ...body };
  if (out.llm_api_key) out.llm_api_key = encrypt(out.llm_api_key as string);
  return out;
}

function sanitize(a: LibraryAgent) {
  return {
    ...a,
    has_llm_api_key: !!(a.llm_api_key && decrypt(a.llm_api_key)),
    llm_api_key: undefined,
  };
}

export async function listLibraryAgents(query: LibraryAgentQueryDto) {
  const { q, role, tags, page, limit } = query;

  const where: FindOptionsWhere<LibraryAgent> = {};
  if (role) where.role = role;

  const qb = repo()
    .createQueryBuilder("la")
    .where("la.deleted_at IS NULL")
    .orderBy("la.name", "ASC")
    .skip((page - 1) * limit)
    .take(limit);

  if (role) qb.andWhere("la.role = :role", { role });
  if (q) qb.andWhere("la.name ILIKE :q OR la.description ILIKE :q", { q: `%${q}%` });
  if (tags) {
    const tagList = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      qb.andWhere("la.tags @> :tags::jsonb", { tags: JSON.stringify(tagList) });
    }
  }

  const [items, total] = await qb.getManyAndCount();
  return { items: items.map(sanitize), total, page, limit };
}

export async function getLibraryAgent(id: string) {
  const a = await repo().findOne({ where: { id, deleted_at: undefined as unknown as null } });
  return a ? sanitize(a) : null;
}

export async function getLibraryAgentBySlug(slug: string) {
  const a = await repo().findOne({ where: { slug, deleted_at: undefined as unknown as null } });
  return a ? sanitize(a) : null;
}

export async function createLibraryAgent(
  dto: CreateLibraryAgentDto,
  publishedBy?: string,
) {
  const existing = await repo().findOneBy({ slug: dto.slug });
  if (existing) {
    throw Object.assign(new Error(`Slug '${dto.slug}' is already taken`), { statusCode: 409 });
  }

  const data = encryptSensitive(dto as Record<string, unknown>);
  const agent = repo().create({
    ...data,
    published_by: publishedBy ?? null,
    agent_type: "custom",
  });
  return sanitize(await repo().save(agent));
}

export async function updateLibraryAgent(id: string, dto: PatchLibraryAgentDto) {
  const agent = await repo().findOne({ where: { id } });
  if (!agent) return null;

  if (agent.agent_type === "system") {
    agent.agent_type = "custom";
  }

  const data = encryptSensitive(dto as Record<string, unknown>);
  Object.assign(agent, data);
  return sanitize(await repo().save(agent));
}

export async function deleteLibraryAgent(id: string) {
  const agent = await repo().findOne({ where: { id } });
  if (!agent) return false;

  await repo().softDelete(id);
  return true;
}
