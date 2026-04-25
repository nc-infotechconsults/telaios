import type { MigrationInterface, QueryRunner } from "typeorm";
import bcrypt from "bcryptjs";

/**
 * Seeds the default admin user if no users exist yet.
 * Credentials are read from environment variables:
 *   ADMIN_EMAIL        (default: admin@telaio.dev)
 *   ADMIN_PASSWORD     (default: admin1234)
 *   ADMIN_DISPLAY_NAME (default: Admin)
 *
 * Skipped automatically when at least one user is already present,
 * so re-running migrations on an existing database is safe.
 */
export class Migration1776000400000 implements MigrationInterface {
  name = "Migration1776000400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS count FROM "users"`
    ) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0) return;

    const email = process.env.ADMIN_EMAIL ?? "admin@telaio.dev";
    const password = process.env.ADMIN_PASSWORD ?? "admin1234";
    const displayName = process.env.ADMIN_DISPLAY_NAME ?? "Admin";
    const passwordHash = await bcrypt.hash(password, 12);

    await queryRunner.query(
      `INSERT INTO "users" ("email", "password_hash", "display_name", "system_role", "is_active")
       VALUES ($1, $2, $3, 'admin', true)
       ON CONFLICT ("email") DO NOTHING`,
      [email, passwordHash, displayName]
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const email = process.env.ADMIN_EMAIL ?? "admin@telaio.dev";
    await queryRunner.query(`DELETE FROM "users" WHERE "email" = $1`, [email]);
  }
}
