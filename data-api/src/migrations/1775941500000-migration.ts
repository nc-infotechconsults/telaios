import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Change document_chunks.embedding from vector(1536) to vector(384).
 *
 * This allows the platform to work out-of-the-box with the fastembed local
 * embedding model (BAAI/bge-small-en-v1.5, 384 dims) when no OpenAI key is
 * configured. Users who set EMBEDDING_API_KEY with an OpenAI-compatible
 * endpoint and switch to a 1536-dim model will need to re-process documents
 * after updating the column to vector(1536).
 */
export class Migration1775941500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the HNSW index before altering the column
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_document_chunks_embedding"`);

    // Alter column type — we truncate any existing 1536-dim vectors; since
    // this is a dev environment with no production data this is acceptable.
    await queryRunner.query(`
      ALTER TABLE "document_chunks"
        ALTER COLUMN "embedding" TYPE vector(384)
        USING NULL
    `);

    // Recreate the HNSW index with the correct dimension
    await queryRunner.query(`
      CREATE INDEX "IDX_document_chunks_embedding"
        ON "document_chunks" USING hnsw (embedding vector_cosine_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_document_chunks_embedding"`);
    await queryRunner.query(`
      ALTER TABLE "document_chunks"
        ALTER COLUMN "embedding" TYPE vector(1536)
        USING NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_document_chunks_embedding"
        ON "document_chunks" USING hnsw (embedding vector_cosine_ops)
    `);
  }
}
