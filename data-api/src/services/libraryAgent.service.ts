import { AppDataSource } from "../configs/data-source.config";
import { LibraryAgent } from "../entities/LibraryAgent.entity";
import type { ILike, FindOptionsWhere } from "typeorm";
import { In } from "typeorm";
import type {
  CreateLibraryAgentDto,
  PatchLibraryAgentDto,
  LibraryAgentQueryDto,
} from "../schemas/libraryAgent.schema";

const repo = () => AppDataSource.getRepository(LibraryAgent);

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
  return { items, total, page, limit };
}

export async function getLibraryAgent(id: string) {
  return repo().findOne({ where: { id, deleted_at: undefined as unknown as null } });
}

export async function getLibraryAgentBySlug(slug: string) {
  return repo().findOne({ where: { slug, deleted_at: undefined as unknown as null } });
}

export async function createLibraryAgent(
  dto: CreateLibraryAgentDto,
  publishedBy?: string,
) {
  const existing = await repo().findOneBy({ slug: dto.slug });
  if (existing) {
    throw Object.assign(new Error(`Slug '${dto.slug}' is already taken`), { statusCode: 409 });
  }

  const agent = repo().create({
    ...dto,
    published_by: publishedBy ?? null,
    agent_type: "custom",
  });
  return repo().save(agent);
}

export async function updateLibraryAgent(id: string, dto: PatchLibraryAgentDto) {
  const agent = await repo().findOne({ where: { id } });
  if (!agent) return null;

  // Allow editing both system and custom agents; promote system→custom on edit
  if (agent.agent_type === "system") {
    agent.agent_type = "custom";
  }

  Object.assign(agent, dto);
  return repo().save(agent);
}

export async function deleteLibraryAgent(id: string) {
  const agent = await repo().findOne({ where: { id } });
  if (!agent) return false;

  await repo().softDelete(id);
  return true;
}
