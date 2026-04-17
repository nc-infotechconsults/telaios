import { AppDataSource } from "../configs/data-source.config";
import { DocumentVersion } from "../entities/DocumentVersion.entity";

const repo = () => AppDataSource.getRepository(DocumentVersion);

export async function listVersions(documentId: string): Promise<DocumentVersion[]> {
  return repo().find({
    where: { document_id: documentId },
    order: { version_number: "DESC" },
  });
}

export async function getVersion(versionId: string): Promise<DocumentVersion | null> {
  return repo().findOneBy({ id: versionId });
}

export async function getLatestVersionNumber(documentId: string): Promise<number> {
  const latest = await repo().findOne({
    where: { document_id: documentId },
    order: { version_number: "DESC" },
  });
  return latest ? latest.version_number : 0;
}

export async function createVersion(
  documentId: string,
  createdBy: string | null,
  data: { s3_key: string; size_bytes: number; checksum_sha256: string; change_description?: string | null },
): Promise<DocumentVersion> {
  const nextVersion = (await getLatestVersionNumber(documentId)) + 1;
  return repo().save(
    repo().create({
      document_id: documentId,
      version_number: nextVersion,
      s3_key: data.s3_key,
      size_bytes: data.size_bytes,
      checksum_sha256: data.checksum_sha256,
      change_description: data.change_description ?? null,
      created_by: createdBy,
    }),
  );
}
