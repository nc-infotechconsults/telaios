import { AppDataSource } from "../configs/data-source.config";
import { Document } from "../entities/Document.entity";
import type { CreateDocumentDto, PatchDocumentDto } from "../schemas/document.schema";

const repo = () => AppDataSource.getRepository(Document);

export async function listDocuments(projectId: string): Promise<Document[]> {
  return repo().find({
    where: { project_id: projectId },
    order: { created_at: "DESC" },
  });
}

export async function createDocument(
  projectId: string,
  uploadedBy: string | null,
  dto: CreateDocumentDto,
): Promise<Document> {
  return repo().save(
    repo().create({
      project_id: projectId,
      uploaded_by: uploadedBy,
      name: dto.name,
      file_type: dto.file_type,
      mime_type: dto.mime_type,
      s3_key: dto.s3_key,
      size_bytes: dto.size_bytes,
      checksum_sha256: dto.checksum_sha256,
      status: dto.status ?? "uploading",
      metadata: dto.metadata ?? null,
    }),
  );
}

export async function getDocument(
  documentId: string,
  projectId: string,
): Promise<Document | null> {
  return repo().findOneBy({ id: documentId, project_id: projectId });
}

/** Look up a document by id only (for internal/service-to-service calls). */
export async function getDocumentById(documentId: string): Promise<Document | null> {
  return repo().findOneBy({ id: documentId });
}

export async function patchDocument(
  documentId: string,
  projectId: string,
  dto: PatchDocumentDto,
): Promise<Document | null> {
  const doc = await repo().findOneBy({ id: documentId, project_id: projectId });
  if (!doc) return null;

  if (dto.name !== undefined) doc.name = dto.name;
  if (dto.status !== undefined) doc.status = dto.status;
  if (dto.error_message !== undefined) doc.error_message = dto.error_message ?? null;
  if (dto.metadata !== undefined) doc.metadata = dto.metadata ?? null;

  return repo().save(doc);
}

export async function deleteDocument(
  documentId: string,
  projectId: string,
): Promise<void> {
  await repo().softDelete({ id: documentId, project_id: projectId });
}

export async function listTrashedDocuments(projectId: string): Promise<Document[]> {
  return repo().find({
    withDeleted: true,
    where: { project_id: projectId },
    order: { created_at: "DESC" },
  }).then((docs) => docs.filter((d) => d.deleted_at !== null));
}

export async function restoreDocument(
  documentId: string,
  projectId: string,
): Promise<void> {
  await repo().restore({ id: documentId, project_id: projectId });
}
