import { AppDataSource } from "../configs/data-source.config";
import { DocumentTag } from "../entities/DocumentTag.entity";
import type { CreateTagDto, PatchTagDto } from "../schemas/documentTag.schema";

const repo = () => AppDataSource.getRepository(DocumentTag);

export async function listTags(projectId: string): Promise<DocumentTag[]> {
  return repo().find({ where: { project_id: projectId }, order: { name: "ASC" } });
}

export async function getTag(tagId: string, projectId: string): Promise<DocumentTag | null> {
  return repo().findOneBy({ id: tagId, project_id: projectId });
}

export async function createTag(projectId: string, dto: CreateTagDto): Promise<DocumentTag> {
  return repo().save(repo().create({ project_id: projectId, name: dto.name, color: dto.color ?? "#3B82F6" }));
}

export async function patchTag(tagId: string, projectId: string, dto: PatchTagDto): Promise<DocumentTag | null> {
  const tag = await repo().findOneBy({ id: tagId, project_id: projectId });
  if (!tag) return null;
  if (dto.name !== undefined) tag.name = dto.name;
  if (dto.color !== undefined) tag.color = dto.color;
  return repo().save(tag);
}

export async function deleteTag(tagId: string, projectId: string): Promise<void> {
  await repo().delete({ id: tagId, project_id: projectId });
}

export async function assignTag(documentId: string, tagId: string): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO document_document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [documentId, tagId],
  );
}

export async function unassignTag(documentId: string, tagId: string): Promise<void> {
  await AppDataSource.query(
    `DELETE FROM document_document_tags WHERE document_id = $1 AND tag_id = $2`,
    [documentId, tagId],
  );
}

export async function getDocumentTags(documentId: string): Promise<DocumentTag[]> {
  const rows = await AppDataSource.query(
    `SELECT dt.* FROM document_tags dt
     JOIN document_document_tags ddt ON ddt.tag_id = dt.id
     WHERE ddt.document_id = $1
     ORDER BY dt.name ASC`,
    [documentId],
  );
  return rows;
}
