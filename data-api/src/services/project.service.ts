import { AppDataSource } from "../configs/data-source.config";
import { Project } from "../entities/Project.entity";
import { addMember } from "./projectMember.service";
import type { CreateProjectDto, PatchProjectDto, ProjectQueryDto } from "../schemas/project.schema";

const repo = () => AppDataSource.getRepository(Project);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string | undefined): id is string {
  return !!id && UUID_REGEX.test(id);
}

export async function listProjects(query: ProjectQueryDto): Promise<{ items: Project[]; total: number; page: number; limit: number }> {
  const { q, page, limit } = query;
  const qb = AppDataSource.getRepository(Project)
    .createQueryBuilder("p")
    .orderBy("p.created_at", "DESC")
    .skip((page - 1) * limit)
    .take(limit);

  if (q) {
    qb.where("p.name ILIKE :q OR p.description ILIKE :q", { q: `%${q}%` });
  }

  const [items, total] = await qb.getManyAndCount();
  return { items, total, page, limit };
}

export async function createProject(dto: CreateProjectDto, creatorId?: string): Promise<Project> {
  const project = await repo().save(repo().create(dto));
  if (isValidUuid(creatorId)) {
    await addMember(project.id, { user_id: creatorId, role: "owner" });
  }
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  return repo().findOne({
    where: { id },
    relations: ["repositories", "plans"],
  });
}

export async function patchProject(id: string, dto: PatchProjectDto): Promise<Project | null> {
  await repo().update(id, dto);
  return repo().findOneBy({ id });
}

export async function deleteProject(id: string): Promise<void> {
  await repo().softDelete(id);
}
