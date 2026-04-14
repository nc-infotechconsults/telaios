import { AppDataSource } from "../configs/data-source.config";
import { DocumentChunk } from "../entities/DocumentChunk.entity";

const chunkRepo = () => AppDataSource.getRepository(DocumentChunk);

export interface StoreChunkDto {
  chunk_index: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown> | null;
}

export interface ChunkSearchResult {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  similarity: number;
}

/**
 * Bulk-insert chunks for a document.
 * Deletes any existing chunks for that document first (idempotent).
 */
export async function storeChunks(
  documentId: string,
  chunks: StoreChunkDto[],
): Promise<void> {
  // Remove stale chunks (re-processing case)
  await chunkRepo().delete({ document_id: documentId });

  if (chunks.length === 0) return;

  // Use raw INSERT to avoid TypeORM's strict column typing for the embedding text column
  for (const c of chunks) {
    await AppDataSource.query(
      `INSERT INTO document_chunks (document_id, chunk_index, content, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        documentId,
        c.chunk_index,
        c.content,
        `[${c.embedding.join(",")}]`,
        c.metadata ? JSON.stringify(c.metadata) : null,
      ],
    );
  }
}

/**
 * Cosine similarity search against all chunks in a project.
 * Uses the pgvector <=> operator (cosine distance; lower = more similar).
 */
export async function searchChunks(
  projectId: string,
  queryEmbedding: number[],
  limit = 5,
): Promise<ChunkSearchResult[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const rows = await AppDataSource.query<
    Array<{
      id: string;
      document_id: string;
      document_name: string;
      chunk_index: number;
      content: string;
      similarity: number;
    }>
  >(
    `
    SELECT
      dc.id,
      dc.document_id,
      d.name AS document_name,
      dc.chunk_index,
      dc.content,
      1 - (dc.embedding::vector <=> $1::vector) AS similarity
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.project_id = $2
      AND d.deleted_at IS NULL
      AND dc.embedding IS NOT NULL
    ORDER BY dc.embedding::vector <=> $1::vector
    LIMIT $3
    `,
    [vectorLiteral, projectId, limit],
  );

  return rows;
}
