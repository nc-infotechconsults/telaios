import { AppDataSource } from "../configs/data-source.config";
import { DocumentActivity } from "../entities/DocumentActivity.entity";

const repo = () => AppDataSource.getRepository(DocumentActivity);

export async function listActivities(documentId: string, limit = 50): Promise<DocumentActivity[]> {
  return repo().find({
    where: { document_id: documentId },
    order: { created_at: "DESC" },
    take: limit,
    relations: ["user"],
  });
}

export async function listProjectActivities(projectId: string, limit = 50): Promise<DocumentActivity[]> {
  return AppDataSource.query(
    `SELECT da.*, d.name as document_name, u.display_name as user_name
     FROM document_activities da
     JOIN documents d ON d.id = da.document_id
     LEFT JOIN users u ON u.id = da.user_id
     WHERE d.project_id = $1 AND d.deleted_at IS NULL
     ORDER BY da.created_at DESC
     LIMIT $2`,
    [projectId, limit],
  );
}

export async function recordActivity(
  documentId: string,
  userId: string | null,
  action: string,
  metadata?: Record<string, unknown> | null,
): Promise<DocumentActivity> {
  return repo().save(
    repo().create({
      document_id: documentId,
      user_id: userId,
      action: action as DocumentActivity["action"],
      metadata: metadata ?? null,
    }),
  );
}
