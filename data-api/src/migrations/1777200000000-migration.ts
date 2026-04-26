import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Configurable embedding dimension for document_chunks.embedding.
 *
 * Reads EMBEDDING_DIMENSION from the environment (default: 384).
 * Alters the vector column and rebuilds the HNSW index when the configured
 * dimension differs from the column's current dimension.
 *
 * Common values by model:
 *   384  — BAAI/bge-small-en-v1.5  (local fastembed, default)
 *   512  — voyage-3-lite, voyage-4-lite (Voyage AI)
 *  1024  — voyage-3, voyage-4, voyage-code-3 (Voyage AI)
 *  1536  — text-embedding-3-small, text-embedding-ada-002 (OpenAI)
 *  3072  — text-embedding-3-large (OpenAI)
 *
 * After changing EMBEDDING_DIMENSION, all existing document chunks will be
 * set to NULL and must be re-indexed (re-process documents in the UI).
 */
export class Migration1777200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const targetDim = parseInt(process.env.EMBEDDING_DIMENSION ?? "384", 10);

    // Read the current column dimension from pg_attribute
    const rows: { atttypmod: number }[] = await queryRunner.query(`
      SELECT a.atttypmod
      FROM   pg_attribute a
      JOIN   pg_class     c ON c.oid = a.attrelid
      WHERE  c.relname  = 'document_chunks'
        AND  a.attname  = 'embedding'
        AND  a.attnum   > 0
    `);

    // atttypmod for vector(N) = N (pgvector stores dim directly)
    const currentDim: number = rows[0]?.atttypmod ?? 384;

    if (currentDim === targetDim) {
      // Nothing to do — dimension already matches
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_document_chunks_embedding"`);

    await queryRunner.query(`
      ALTER TABLE "document_chunks"
        ALTER COLUMN "embedding" TYPE vector(${targetDim})
        USING NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_document_chunks_embedding"
        ON "document_chunks" USING hnsw (embedding vector_cosine_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore to the previous default (384)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_document_chunks_embedding"`);
    await queryRunner.query(`
      ALTER TABLE "document_chunks"
        ALTER COLUMN "embedding" TYPE vector(384)
        USING NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_document_chunks_embedding"
        ON "document_chunks" USING hnsw (embedding vector_cosine_ops)
    `);
  }
}
