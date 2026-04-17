import "reflect-metadata";
import { Client } from "pg";
import { AppDataSource } from "../../configs/data-source.config";

/** Creates the sweai_test database if it doesn't exist, then initialises TypeORM (runs migrations). */
export async function initTestDb(): Promise<void> {
  if (AppDataSource.isInitialized) return;

  // Ensure the test database exists
  const admin = new Client({
    host: "localhost",
    port: 5432,
    user: "sweai",
    password: "sweai",
    database: "postgres",
  });
  await admin.connect();
  const { rows } = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = 'sweai_test'"
  );
  if (rows.length === 0) {
    await admin.query("CREATE DATABASE sweai_test");
  }
  await admin.end();

  await AppDataSource.initialize();
  // Ensure schema is up to date (the migrations path in the config uses a relative glob
  // that resolves correctly from the CLI but not from ts-jest CWD, so we sync here).
  await AppDataSource.synchronize();
}

/** Truncates all user-data tables (preserves the migrations book-keeping table). */
export async function clearAllTables(): Promise<void> {
  await AppDataSource.query(`
    TRUNCATE
      task_artifacts,
      project_members,
      task_repositories,
      task_dependencies,
      tasks,
      messages,
      plans,
      helm_releases,
      environments,
      workspaces,
      repositories,
      documents,
      settings,
      projects,
      agent_profiles,
      users
    RESTART IDENTITY CASCADE
  `);
}

/** Destroys the TypeORM connection — call once in the final afterAll. */
export async function destroyTestDb(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
