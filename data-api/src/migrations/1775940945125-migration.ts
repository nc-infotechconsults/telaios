import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775940945125 implements MigrationInterface {
    name = 'Migration1775940945125'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "source_type"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "local_path"`);
        await queryRunner.query(`ALTER TABLE "agent_profiles" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD "local_clone_path" character varying`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "agent_profiles" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "agent_profiles" ADD "description" text`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "description" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "projects" ADD "description" character varying`);
        await queryRunner.query(`ALTER TABLE "agent_profiles" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "agent_profiles" ADD "description" character varying`);
        await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "local_clone_path"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "agent_profiles" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD "local_path" character varying`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD "source_type" character varying NOT NULL DEFAULT 'remote'`);
    }

}
