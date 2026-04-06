import { AppDataSource } from "../data-source";
import { Project } from "../entities/Project";
import { addMember } from "./projectMember.service";
import type { CreateProjectDto, PatchProjectDto } from "../schemas/project.schema";

const repo = () => AppDataSource.getRepository(Project);

export async function listProjects(): Promise<Project[]> {
  return repo().find({ order: { created_at: "DESC" } });
}

export async function createProject(dto: CreateProjectDto, creatorId?: string): Promise<Project> {
  const project = await repo().save(repo().create(dto));
  if (creatorId) {
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
  await repo().delete(id);
}
