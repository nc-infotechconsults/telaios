import { AppDataSource } from "../configs/data-source.config";
import { LibraryMCP } from "../entities/LibraryMCP.entity";
import type {
  CreateLibraryMcpDto,
  PatchLibraryMcpDto,
  LibraryMcpQueryDto,
} from "../schemas/libraryMcp.schema";

const repo = () => AppDataSource.getRepository(LibraryMCP);

export async function listLibraryMcps(query: LibraryMcpQueryDto) {
  const { q, tags, page, limit } = query;

  const qb = repo()
    .createQueryBuilder("lm")
    .where("lm.deleted_at IS NULL")
    .orderBy("lm.name", "ASC")
    .skip((page - 1) * limit)
    .take(limit);

  if (q) qb.andWhere("lm.name ILIKE :q OR lm.description ILIKE :q", { q: `%${q}%` });
  if (tags) {
    const tagList = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      qb.andWhere("lm.tags @> :tags::jsonb", { tags: JSON.stringify(tagList) });
    }
  }

  const [items, total] = await qb.getManyAndCount();
  return { items, total, page, limit };
}

export async function getLibraryMcp(id: string) {
  return repo().findOne({ where: { id } });
}

export async function createLibraryMcp(dto: CreateLibraryMcpDto, publishedBy?: string) {
  const existing = await repo().findOneBy({ slug: dto.slug });
  if (existing) {
    throw Object.assign(new Error(`Slug '${dto.slug}' is already taken`), { statusCode: 409 });
  }

  const mcp = repo().create({ ...dto, published_by: publishedBy ?? null });
  return repo().save(mcp);
}

export async function updateLibraryMcp(id: string, dto: PatchLibraryMcpDto) {
  const mcp = await repo().findOne({ where: { id } });
  if (!mcp) return null;
  Object.assign(mcp, dto);
  return repo().save(mcp);
}

export async function deleteLibraryMcp(id: string) {
  const mcp = await repo().findOne({ where: { id } });
  if (!mcp) return false;
  await repo().softDelete(id);
  return true;
}
