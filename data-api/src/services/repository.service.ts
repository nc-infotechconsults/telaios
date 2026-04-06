import { AppDataSource } from "../data-source";
import { Repository } from "../entities/Repository";
import { encrypt, decrypt } from "../middleware/crypto";
import type { CreateRepositoryDto, PatchRepositoryDto } from "../schemas/repository.schema";

const repo = () => AppDataSource.getRepository(Repository);

export function sanitizeRepository(r: Repository) {
  const { credentials, ...rest } = r;
  return { ...rest, has_credentials: !!decrypt(credentials) };
}

export async function listRepositoriesByProject(projectId: string) {
  const repos = await repo().find({
    where: { project_id: projectId },
    order: { name: "ASC" },
  });
  return repos.map(sanitizeRepository);
}

export async function createRepository(projectId: string, dto: CreateRepositoryDto) {
  const data: Record<string, unknown> = { ...dto, project_id: projectId };
  if (dto.credentials) data.credentials = encrypt(dto.credentials);
  const saved = await repo().save(repo().create(data as Partial<Repository>));
  return sanitizeRepository(saved as unknown as Repository);
}

export async function getRepository(id: string, projectId: string) {
  const r = await repo().findOneBy({ id, project_id: projectId });
  return r ? sanitizeRepository(r) : null;
}

export async function patchRepository(id: string, dto: PatchRepositoryDto) {
  const data: Record<string, unknown> = { ...dto };
  if (dto.credentials) data.credentials = encrypt(dto.credentials);
  await repo().update(id, data);
  const updated = await repo().findOneBy({ id });
  return updated ? sanitizeRepository(updated) : null;
}

export async function patchRepositoryById(id: string, dto: PatchRepositoryDto) {
  return patchRepository(id, dto);
}

export async function deleteRepository(id: string): Promise<void> {
  await repo().delete(id);
}
