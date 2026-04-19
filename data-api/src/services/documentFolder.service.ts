import { AppDataSource } from "../configs/data-source.config";
import { DocumentFolder } from "../entities/DocumentFolder.entity";
import type { CreateFolderDto, PatchFolderDto } from "../schemas/documentFolder.schema";
import { IsNull } from "typeorm";

const repo = () => AppDataSource.getRepository(DocumentFolder);

export async function listFolders(projectId: string, parentFolderId?: string | null): Promise<DocumentFolder[]> {
  return repo().find({
    where: {
      project_id: projectId,
      parent_folder_id: parentFolderId === undefined || parentFolderId === null ? IsNull() : parentFolderId,
    },
    order: { name: "ASC" },
  });
}

export async function listAllFolders(projectId: string): Promise<DocumentFolder[]> {
  return repo().find({
    where: { project_id: projectId },
    order: { path: "ASC" },
  });
}

export async function getFolder(folderId: string, projectId: string): Promise<DocumentFolder | null> {
  return repo().findOneBy({ id: folderId, project_id: projectId });
}

export async function createFolder(projectId: string, createdBy: string | null, dto: CreateFolderDto): Promise<DocumentFolder> {
  let path = `/${dto.name}`;
  if (dto.parent_folder_id) {
    const parent = await repo().findOneBy({ id: dto.parent_folder_id, project_id: projectId });
    if (parent) path = `${parent.path}/${dto.name}`;
  }
  return repo().save(
    repo().create({
      project_id: projectId,
      parent_folder_id: dto.parent_folder_id ?? null,
      name: dto.name,
      path,
      created_by: createdBy,
    }),
  );
}

export async function patchFolder(folderId: string, projectId: string, dto: PatchFolderDto): Promise<DocumentFolder | null> {
  const folder = await repo().findOneBy({ id: folderId, project_id: projectId });
  if (!folder) return null;
  if (dto.name !== undefined) {
    folder.name = dto.name;
    // Rebuild path
    if (folder.parent_folder_id) {
      const parent = await repo().findOneBy({ id: folder.parent_folder_id, project_id: projectId });
      folder.path = parent ? `${parent.path}/${dto.name}` : `/${dto.name}`;
    } else {
      folder.path = `/${dto.name}`;
    }
  }
  if (dto.parent_folder_id !== undefined) {
    folder.parent_folder_id = dto.parent_folder_id ?? null;
    if (dto.parent_folder_id) {
      const parent = await repo().findOneBy({ id: dto.parent_folder_id, project_id: projectId });
      folder.path = parent ? `${parent.path}/${folder.name}` : `/${folder.name}`;
    } else {
      folder.path = `/${folder.name}`;
    }
  }
  return repo().save(folder);
}

export async function deleteFolder(folderId: string, projectId: string): Promise<void> {
  await repo().softDelete({ id: folderId, project_id: projectId });
}
