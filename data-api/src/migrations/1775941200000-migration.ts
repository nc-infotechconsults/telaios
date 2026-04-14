import type { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775941200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE "document_chunks" (
        "id"            uuid      NOT NULL DEFAULT gen_random_uuid(),
        "document_id"   uuid      NOT NULL,
        "chunk_index"   integer   NOT NULL,
        "content"       text      NOT NULL,
        "embedding"     vector(1536)        NULL,
        "metadata"      jsonb               NULL,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_chunks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_document_chunks_document"
          FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_document_chunks_document_id" ON "document_chunks" ("document_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_document_chunks_chunk_index" ON "document_chunks" ("document_id", "chunk_index")`
    );
    // HNSW index for cosine-similarity RAG search
    await queryRunner.query(
      `CREATE INDEX "IDX_document_chunks_embedding" ON "document_chunks" USING hnsw (embedding vector_cosine_ops)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "document_chunks"`);
  }
}
