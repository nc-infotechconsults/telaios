import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1775914943523 implements MigrationInterface {
    name = 'Migration1775914943523'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "title" text, "status" character varying NOT NULL DEFAULT 'draft', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "confirmed_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "agent_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "agent_type" character varying NOT NULL DEFAULT 'langgraph', "llm_provider" character varying, "llm_model" character varying, "llm_api_key" character varying, "llm_base_url" character varying, "github_token" character varying, "mcp_servers" jsonb NOT NULL DEFAULT '[]', "skills" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4583ee140a2222f8fcecf3ac023" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "task_dependencies" ("task_id" uuid NOT NULL, "depends_on_task_id" character varying NOT NULL, CONSTRAINT "PK_34abffd156d4d10466f5f254ef2" PRIMARY KEY ("task_id", "depends_on_task_id"))`);
        await queryRunner.query(`CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "plan_id" uuid NOT NULL, "title" character varying NOT NULL, "description" text, "type" character varying NOT NULL DEFAULT 'general', "status" character varying NOT NULL DEFAULT 'pending', "execution_order" integer NOT NULL DEFAULT '0', "agent_profile_id" uuid, "assigned_instance_id" character varying, "result" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "task_repositories" ("task_id" uuid NOT NULL, "repository_id" uuid NOT NULL, CONSTRAINT "PK_7a7228202d6ec38301034eadd53" PRIMARY KEY ("task_id", "repository_id"))`);
        await queryRunner.query(`CREATE TABLE "repositories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "name" character varying NOT NULL, "source_type" character varying NOT NULL DEFAULT 'remote', "remote_url" character varying, "branch" character varying NOT NULL DEFAULT 'main', "auth_type" character varying NOT NULL DEFAULT 'none', "credentials" character varying, "local_path" character varying, "status" character varying NOT NULL DEFAULT 'unconfigured', "error_message" character varying, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ef0c358c04b4f4d29b8ca68ddff" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "plan_id" uuid, "role" character varying NOT NULL, "content" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "display_name" character varying NOT NULL, "system_role" character varying NOT NULL DEFAULT 'member', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "project_members" ("user_id" uuid NOT NULL, "project_id" uuid NOT NULL, "role" character varying NOT NULL DEFAULT 'viewer', "joined_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b3f491d3a3f986106d281d8eb4b" PRIMARY KEY ("user_id", "project_id"))`);
        await queryRunner.query(`CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "status" character varying NOT NULL DEFAULT 'planning', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" integer NOT NULL DEFAULT '1', "llm_provider" character varying, "llm_model" character varying, "llm_api_key" character varying, "llm_base_url" character varying, "llm_temperature" double precision, "llm_max_tokens" integer, "llm_top_p" double precision, "llm_frequency_penalty" double precision, "llm_presence_penalty" double precision, "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "plans" ADD CONSTRAINT "FK_dc1f43af02c0a99dbf4c8a2b532" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "task_dependencies" ADD CONSTRAINT "FK_1ae6688b1bd90fffe857f4cb707" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_31a280e3d0a129221e614c63125" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "FK_74369b28b2bb53deac8de3179f7" FOREIGN KEY ("agent_profile_id") REFERENCES "agent_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "task_repositories" ADD CONSTRAINT "FK_59a0426041bf7822e04a35b0519" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "task_repositories" ADD CONSTRAINT "FK_fd46cc05e47953bdf4f189948f5" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "repositories" ADD CONSTRAINT "FK_d6cd2623ff7f9e2258ebda0cb67" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_0139a4041dc028434fb8b89ae47" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_a3c8c952a68243e20b41824b04b" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_members" ADD CONSTRAINT "FK_e89aae80e010c2faa72e6a49ce8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "project_members" ADD CONSTRAINT "FK_b5729113570c20c7e214cf3f58d" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "project_members" DROP CONSTRAINT "FK_b5729113570c20c7e214cf3f58d"`);
        await queryRunner.query(`ALTER TABLE "project_members" DROP CONSTRAINT "FK_e89aae80e010c2faa72e6a49ce8"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_a3c8c952a68243e20b41824b04b"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_0139a4041dc028434fb8b89ae47"`);
        await queryRunner.query(`ALTER TABLE "repositories" DROP CONSTRAINT "FK_d6cd2623ff7f9e2258ebda0cb67"`);
        await queryRunner.query(`ALTER TABLE "task_repositories" DROP CONSTRAINT "FK_fd46cc05e47953bdf4f189948f5"`);
        await queryRunner.query(`ALTER TABLE "task_repositories" DROP CONSTRAINT "FK_59a0426041bf7822e04a35b0519"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_74369b28b2bb53deac8de3179f7"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_31a280e3d0a129221e614c63125"`);
        await queryRunner.query(`ALTER TABLE "task_dependencies" DROP CONSTRAINT "FK_1ae6688b1bd90fffe857f4cb707"`);
        await queryRunner.query(`ALTER TABLE "plans" DROP CONSTRAINT "FK_dc1f43af02c0a99dbf4c8a2b532"`);
        await queryRunner.query(`DROP TABLE "settings"`);
        await queryRunner.query(`DROP TABLE "projects"`);
        await queryRunner.query(`DROP TABLE "project_members"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "messages"`);
        await queryRunner.query(`DROP TABLE "repositories"`);
        await queryRunner.query(`DROP TABLE "task_repositories"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`DROP TABLE "task_dependencies"`);
        await queryRunner.query(`DROP TABLE "agent_profiles"`);
        await queryRunner.query(`DROP TABLE "plans"`);
    }

}
