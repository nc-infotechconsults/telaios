import { AppDataSource } from "../configs/data-source.config";
import { DocumentFavorite } from "../entities/DocumentFavorite.entity";

const repo = () => AppDataSource.getRepository(DocumentFavorite);

export async function isFavorite(documentId: string, userId: string): Promise<boolean> {
  const count = await repo().count({ where: { document_id: documentId, user_id: userId } });
  return count > 0;
}

export async function addFavorite(documentId: string, userId: string): Promise<void> {
  await repo().save(repo().create({ document_id: documentId, user_id: userId }));
}

export async function removeFavorite(documentId: string, userId: string): Promise<void> {
  await repo().delete({ document_id: documentId, user_id: userId });
}

export async function listFavorites(userId: string, projectId: string): Promise<string[]> {
  const rows = await AppDataSource.query(
    `SELECT df.document_id FROM document_favorites df
     JOIN documents d ON d.id = df.document_id
     WHERE df.user_id = $1 AND d.project_id = $2 AND d.deleted_at IS NULL
     ORDER BY df.created_at DESC`,
    [userId, projectId],
  );
  return rows.map((r: { document_id: string }) => r.document_id);
}
