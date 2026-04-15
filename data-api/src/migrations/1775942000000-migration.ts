import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775942000000 implements MigrationInterface {
    name = 'Migration1775942000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Rename local_clone_path -> local_path to match entity and scheduler
        await queryRunner.query(`ALTER TABLE "repositories" RENAME COLUMN "local_clone_path" TO "local_path"`);
        // Add source_type column (remote | local), defaults to 'remote'
        await queryRunner.query(`ALTER TABLE "repositories" ADD COLUMN IF NOT EXISTS "source_type" character varying NOT NULL DEFAULT 'remote'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN IF EXISTS "source_type"`);
        await queryRunner.query(`ALTER TABLE "repositories" RENAME COLUMN "local_path" TO "local_clone_path"`);
    }
}
