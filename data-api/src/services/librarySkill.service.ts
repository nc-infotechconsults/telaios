import { AppDataSource } from "../configs/data-source.config";
import { LibrarySkill } from "../entities/LibrarySkill.entity";
import { LibrarySkillFile } from "../entities/LibrarySkillFile.entity";
import JSZip from "jszip";
import type {
  CreateLibrarySkillDto,
  PatchLibrarySkillDto,
  LibrarySkillQueryDto,
  SkillFileDto,
} from "../schemas/librarySkill.schema";

const repo = () => AppDataSource.getRepository(LibrarySkill);
const fileRepo = () => AppDataSource.getRepository(LibrarySkillFile);

export async function listLibrarySkills(query: LibrarySkillQueryDto) {
  const { q, tags, page, limit } = query;

  const qb = repo()
    .createQueryBuilder("ls")
    .where("ls.deleted_at IS NULL")
    .orderBy("ls.name", "ASC")
    .skip((page - 1) * limit)
    .take(limit);

  if (q) qb.andWhere("ls.name ILIKE :q OR ls.description ILIKE :q", { q: `%${q}%` });
  if (tags) {
    const tagList = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      qb.andWhere("ls.tags @> :tags::jsonb", { tags: JSON.stringify(tagList) });
    }
  }

  const [items, total] = await qb.getManyAndCount();
  return { items, total, page, limit };
}

export async function getLibrarySkill(id: string) {
  return repo().findOne({
    where: { id },
    relations: ["files"],
    // Only return non-deleted files
  }).then((skill) => {
    if (!skill) return null;
    skill.files = (skill.files ?? []).filter((f) => !f.deleted_at);
    return skill;
  });
}

export async function createLibrarySkill(dto: CreateLibrarySkillDto, publishedBy?: string) {
  const existing = await repo().findOneBy({ slug: dto.slug });
  if (existing) {
    throw Object.assign(new Error(`Slug '${dto.slug}' is already taken`), { statusCode: 409 });
  }

  const { files: fileDtos, ...skillData } = dto;

  const skill = repo().create({ ...skillData, published_by: publishedBy ?? null });
  const saved = await repo().save(skill);

  if (fileDtos && fileDtos.length > 0) {
    await upsertFiles(saved.id, fileDtos);
  }

  return getLibrarySkill(saved.id) as Promise<LibrarySkill>;
}

export async function updateLibrarySkill(id: string, dto: PatchLibrarySkillDto) {
  const skill = await repo().findOne({ where: { id } });
  if (!skill) return null;

  const { files: fileDtos, ...skillData } = dto;

  Object.assign(skill, skillData);
  await repo().save(skill);

  if (fileDtos !== undefined) {
    await upsertFiles(id, fileDtos);
  }

  return getLibrarySkill(id);
}

export async function deleteLibrarySkill(id: string) {
  const skill = await repo().findOne({ where: { id } });
  if (!skill) return false;
  await repo().softDelete(id);
  return true;
}

/** Build and return a zip buffer for the skill package. */
export async function exportLibrarySkillAsZip(id: string): Promise<{ buffer: Buffer; slug: string } | null> {
  const skill = await getLibrarySkill(id);
  if (!skill) return null;

  const zip = new JSZip();
  const dir = zip.folder(skill.slug)!;

  // Synthesize SKILL.md frontmatter + body
  const frontmatter = buildFrontmatter(skill);
  dir.file("SKILL.md", frontmatter + skill.content);

  // Add supporting files
  for (const f of skill.files ?? []) {
    dir.file(f.path, f.content);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, slug: skill.slug };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Upsert supporting files for a skill:
 * - Files in `fileDtos` that match an existing active file by path → update content.
 * - Files in `fileDtos` that have no active match → create new row.
 * - Active files whose path is NOT in `fileDtos` → soft-delete.
 */
async function upsertFiles(skillId: string, fileDtos: SkillFileDto[]): Promise<void> {
  const existing = await fileRepo().find({
    where: { skill_id: skillId },
    withDeleted: false,
  });

  const existingByPath = new Map(existing.map((f) => [f.path, f]));
  const incomingPaths = new Set(fileDtos.map((f) => f.path));

  // Soft-delete files no longer in the payload
  for (const f of existing) {
    if (!incomingPaths.has(f.path)) {
      await fileRepo().softDelete(f.id);
    }
  }

  // Upsert incoming files
  for (const dto of fileDtos) {
    const existing = existingByPath.get(dto.path);
    if (existing) {
      existing.content = dto.content;
      await fileRepo().save(existing);
    } else {
      const newFile = fileRepo().create({
        skill_id: skillId,
        path: dto.path,
        content: dto.content,
      });
      await fileRepo().save(newFile);
    }
  }
}

/** Build YAML frontmatter string from skill fields. */
function buildFrontmatter(skill: LibrarySkill): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${skill.slug}`);
  lines.push(`description: ${skill.description ?? ""}`);
  if (skill.license) lines.push(`license: ${skill.license}`);
  if (skill.compatibility) lines.push(`compatibility: ${skill.compatibility}`);
  if (skill.skill_metadata && Object.keys(skill.skill_metadata).length > 0) {
    lines.push("metadata:");
    for (const [k, v] of Object.entries(skill.skill_metadata)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}
