import { AppDataSource } from "../configs/data-source.config";
import { Workspace } from "../entities/Workspace.entity";
import type { WorkspaceConfig } from "../entities/Workspace.entity";
import type { DeepPartial } from "typeorm";
import type { CreateWorkspaceDto, PatchWorkspaceDto } from "../schemas/workspace.schema";

const repo = () => AppDataSource.getRepository(Workspace);

export async function listWorkspacesByProject(projectId: string) {
  return repo().find({
    where: { project_id: projectId },
    order: { created_at: "DESC" },
  });
}

export async function createWorkspace(
  projectId: string,
  dto: CreateWorkspaceDto,
  createdBy?: string,
) {
  const emptyConfig: WorkspaceConfig = {};
  const workspace = repo().create({
    project_id: projectId,
    name: dto.name,
    config: dto.config ?? emptyConfig,
    created_by: createdBy,
  } as DeepPartial<Workspace>);
  return repo().save(workspace);
}

export async function getWorkspace(id: string) {
  return repo().findOne({ where: { id }, relations: ["project"] });
}

export async function patchWorkspace(id: string, dto: PatchWorkspaceDto) {
  await repo().update(id, dto);
  return repo().findOneBy({ id });
}

export async function deleteWorkspace(id: string): Promise<void> {
  await repo().softDelete(id);
}
