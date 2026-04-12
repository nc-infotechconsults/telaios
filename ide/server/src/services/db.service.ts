import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { config } from "@/core/config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbDriverType = "postgresql" | "sqlite";

export interface DbConnectionConfig {
  id: string;
  name: string;
  driver: DbDriverType;
  // PostgreSQL
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  // SQLite
  filePath?: string; // relative to workspace root
}

export interface DbSchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  defaultValue?: string;
}

export interface DbSchemaTable {
  name: string;
  type: "table" | "view";
  schema: string;
  columns: DbSchemaColumn[];
}

export interface DbSchemaGroup {
  name: string;
  tables: DbSchemaTable[];
}

export interface DbSchemaResult {
  connectionId: string;
  schemas: DbSchemaGroup[];
}

export interface DbQueryResultColumn {
  name: string;
  type: string;
}

export interface DbQueryResult {
  columns: DbQueryResultColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface IDatabaseProvider {
  test(): Promise<{ ok: boolean; error?: string }>;
  getSchema(connectionId: string): Promise<DbSchemaResult>;
  query(sql: string): Promise<DbQueryResult>;
  close(): Promise<void>;
}

// ── SQLite Provider ───────────────────────────────────────────────────────────

class SqliteProvider implements IDatabaseProvider {
  private db: import("bun:sqlite").Database | null = null;

  constructor(private absFilePath: string) {}

  private async open(): Promise<import("bun:sqlite").Database> {
    if (!this.db) {
      const { Database } = await import("bun:sqlite");
      this.db = new Database(this.absFilePath, { create: true });
      this.db.run("PRAGMA foreign_keys = ON");
    }
    return this.db;
  }

  async test(): Promise<{ ok: boolean; error?: string }> {
    try {
      const db = await this.open();
      db.prepare("SELECT 1").all();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async getSchema(connectionId: string): Promise<DbSchemaResult> {
    const db = await this.open();

    const tables = db
      .prepare(
        `SELECT name, type FROM sqlite_master
         WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string; type: string }>;

    const schemaGroup: DbSchemaGroup = { name: "main", tables: [] };

    for (const t of tables) {
      const cols = db
        .prepare(`PRAGMA table_info(${JSON.stringify(t.name)})`)
        .all() as Array<{
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }>;

      const fks = db
        .prepare(`PRAGMA foreign_key_list(${JSON.stringify(t.name)})`)
        .all() as Array<{ from: string }>;
      const fkSet = new Set(fks.map((f) => f.from));

      schemaGroup.tables.push({
        name: t.name,
        type: t.type === "view" ? "view" : "table",
        schema: "main",
        columns: cols.map((c) => ({
          name: c.name,
          type: c.type || "TEXT",
          nullable: c.notnull === 0,
          isPrimaryKey: c.pk > 0,
          isForeignKey: fkSet.has(c.name),
          defaultValue: c.dflt_value ?? undefined,
        })),
      });
    }

    return { connectionId, schemas: [schemaGroup] };
  }

  async query(sql: string): Promise<DbQueryResult> {
    const start = Date.now();
    try {
      const db = await this.open();
      const trimmed = sql.trim().toUpperCase();
      const isSelect =
        /^(SELECT|WITH|EXPLAIN|PRAGMA|VALUES)\b/.test(trimmed);

      if (isSelect) {
        const rows = db.prepare(sql).all() as Record<string, unknown>[];
        const executionTimeMs = Date.now() - start;
        const columns =
          rows.length > 0
            ? Object.keys(rows[0]).map((n) => ({ name: n, type: "text" }))
            : [];
        return { columns, rows, rowCount: rows.length, executionTimeMs };
      } else {
        const info = db.run(sql);
        const executionTimeMs = Date.now() - start;
        return {
          columns: [{ name: "changes", type: "integer" }],
          rows: [{ changes: info.changes }],
          rowCount: info.changes,
          executionTimeMs,
        };
      }
    } catch (e) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
}

// ── PostgreSQL Provider ───────────────────────────────────────────────────────

class PostgresProvider implements IDatabaseProvider {
  private pool: import("pg").Pool | null = null;

  constructor(private conn: DbConnectionConfig) {}

  private async getPool(): Promise<import("pg").Pool> {
    if (!this.pool) {
      const { Pool } = await import("pg");
      this.pool = new Pool({
        host: this.conn.host ?? "localhost",
        port: this.conn.port ?? 5432,
        user: this.conn.user,
        password: this.conn.password,
        database: this.conn.database,
        ssl: this.conn.ssl ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });
    }
    return this.pool;
  }

  async test(): Promise<{ ok: boolean; error?: string }> {
    let client: import("pg").PoolClient | null = null;
    try {
      const pool = await this.getPool();
      client = await pool.connect();
      await client.query("SELECT 1");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      client?.release();
    }
  }

  async getSchema(connectionId: string): Promise<DbSchemaResult> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      // ── schemas ──────────────────────────────────────────────────────────
      const schemasRes = await client.query<{ schema_name: string }>(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name NOT IN ('information_schema','pg_catalog','pg_toast')
          AND schema_name NOT LIKE 'pg_%'
        ORDER BY schema_name
      `);

      const groups: DbSchemaGroup[] = [];

      for (const { schema_name } of schemasRes.rows) {
        // ── tables ─────────────────────────────────────────────────────────
        const tablesRes = await client.query<{
          table_name: string;
          table_type: string;
        }>(
          `SELECT table_name, table_type
           FROM information_schema.tables
           WHERE table_schema = $1
           ORDER BY table_name`,
          [schema_name],
        );

        // ── columns (one query per schema) ─────────────────────────────────
        const colsRes = await client.query<{
          table_name: string;
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
          is_pk: boolean;
          is_fk: boolean;
        }>(
          `SELECT
             c.table_name,
             c.column_name,
             c.data_type,
             c.is_nullable,
             c.column_default,
             EXISTS (
               SELECT 1
               FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu
                 ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema   = kcu.table_schema
               WHERE tc.constraint_type = 'PRIMARY KEY'
                 AND tc.table_schema   = c.table_schema
                 AND tc.table_name     = c.table_name
                 AND kcu.column_name   = c.column_name
             ) AS is_pk,
             EXISTS (
               SELECT 1
               FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu
                 ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema   = kcu.table_schema
               WHERE tc.constraint_type = 'FOREIGN KEY'
                 AND tc.table_schema   = c.table_schema
                 AND tc.table_name     = c.table_name
                 AND kcu.column_name   = c.column_name
             ) AS is_fk
           FROM information_schema.columns c
           WHERE c.table_schema = $1
           ORDER BY c.table_name, c.ordinal_position`,
          [schema_name],
        );

        // group columns by table
        const colsByTable = new Map<string, DbSchemaColumn[]>();
        for (const col of colsRes.rows) {
          if (!colsByTable.has(col.table_name)) {
            colsByTable.set(col.table_name, []);
          }
          colsByTable.get(col.table_name)!.push({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === "YES",
            isPrimaryKey: Boolean(col.is_pk),
            isForeignKey: Boolean(col.is_fk),
            defaultValue: col.column_default ?? undefined,
          });
        }

        groups.push({
          name: schema_name,
          tables: tablesRes.rows.map((t) => ({
            name: t.table_name,
            type: t.table_type === "VIEW" ? "view" : "table",
            schema: schema_name,
            columns: colsByTable.get(t.table_name) ?? [],
          })),
        });
      }

      return { connectionId, schemas: groups };
    } finally {
      client.release();
    }
  }

  async query(sql: string): Promise<DbQueryResult> {
    const start = Date.now();
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      const result = await client.query(sql);
      const executionTimeMs = Date.now() - start;
      return {
        columns: result.fields.map((f) => ({ name: f.name, type: "text" })),
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rowCount ?? result.rows.length,
        executionTimeMs,
      };
    } catch (e) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool?.end().catch(() => {});
    this.pool = null;
  }
}

// ── Provider factory ──────────────────────────────────────────────────────────

function createProvider(
  conn: DbConnectionConfig,
  workspaceId: string,
): IDatabaseProvider {
  if (conn.driver === "sqlite") {
    const absPath = path.join(
      config.WORKSPACES_ROOT,
      workspaceId,
      conn.filePath ?? "database.sqlite",
    );
    return new SqliteProvider(absPath);
  }
  return new PostgresProvider(conn);
}

// ── Connection storage ────────────────────────────────────────────────────────

function connectionsFilePath(workspaceId: string): string {
  return path.join(
    config.WORKSPACES_ROOT,
    workspaceId,
    ".ide",
    "db-connections.json",
  );
}

async function readConnections(
  workspaceId: string,
): Promise<DbConnectionConfig[]> {
  const file = connectionsFilePath(workspaceId);
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as DbConnectionConfig[];
  } catch {
    return [];
  }
}

async function persistConnections(
  workspaceId: string,
  connections: DbConnectionConfig[],
): Promise<void> {
  const file = connectionsFilePath(workspaceId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(connections, null, 2), "utf8");
}

// ── Provider cache ────────────────────────────────────────────────────────────
// keyed by `${workspaceId}:${connectionId}`
const providerCache = new Map<string, IDatabaseProvider>();

function cacheKey(workspaceId: string, connectionId: string): string {
  return `${workspaceId}:${connectionId}`;
}

async function getProvider(
  workspaceId: string,
  connectionId: string,
): Promise<IDatabaseProvider> {
  const k = cacheKey(workspaceId, connectionId);
  if (providerCache.has(k)) return providerCache.get(k)!;

  const conns = await readConnections(workspaceId);
  const conn = conns.find((c) => c.id === connectionId);
  if (!conn) throw new Error(`Connection '${connectionId}' not found`);

  const provider = createProvider(conn, workspaceId);
  providerCache.set(k, provider);
  return provider;
}

async function evictProvider(
  workspaceId: string,
  connectionId: string,
): Promise<void> {
  const k = cacheKey(workspaceId, connectionId);
  const p = providerCache.get(k);
  if (p) {
    await p.close().catch(() => {});
    providerCache.delete(k);
  }
}

// ── Public DatabaseService ────────────────────────────────────────────────────

export const DatabaseService = {
  // ── Connections ──────────────────────────────────────────────────────────

  async listConnections(
    workspaceId: string,
  ): Promise<Omit<DbConnectionConfig, "password">[]> {
    const conns = await readConnections(workspaceId);
    // Strip passwords from list response
    return conns.map(({ password: _pw, ...rest }) => rest);
  },

  async addConnection(
    workspaceId: string,
    input: Omit<DbConnectionConfig, "id">,
  ): Promise<Omit<DbConnectionConfig, "password">> {
    const conns = await readConnections(workspaceId);
    const newConn: DbConnectionConfig = {
      ...input,
      id: crypto.randomUUID(),
    };
    conns.push(newConn);
    await persistConnections(workspaceId, conns);
    const { password: _pw, ...safe } = newConn;
    return safe;
  },

  async updateConnection(
    workspaceId: string,
    connectionId: string,
    input: Partial<Omit<DbConnectionConfig, "id">>,
  ): Promise<Omit<DbConnectionConfig, "password">> {
    const conns = await readConnections(workspaceId);
    const idx = conns.findIndex((c) => c.id === connectionId);
    if (idx === -1) throw new Error(`Connection '${connectionId}' not found`);
    conns[idx] = { ...conns[idx], ...input };
    await persistConnections(workspaceId, conns);
    await evictProvider(workspaceId, connectionId);
    const { password: _pw, ...safe } = conns[idx];
    return safe;
  },

  async deleteConnection(
    workspaceId: string,
    connectionId: string,
  ): Promise<void> {
    const conns = await readConnections(workspaceId);
    const filtered = conns.filter((c) => c.id !== connectionId);
    await persistConnections(workspaceId, filtered);
    await evictProvider(workspaceId, connectionId);
  },

  async testConnection(
    workspaceId: string,
    input: Omit<DbConnectionConfig, "id">,
  ): Promise<{ ok: boolean; error?: string }> {
    const tempConn: DbConnectionConfig = { ...input, id: "__test__" };
    const provider = createProvider(tempConn, workspaceId);
    const result = await provider.test();
    await provider.close().catch(() => {});
    return result;
  },

  // ── Schema ────────────────────────────────────────────────────────────────

  async getSchema(
    workspaceId: string,
    connectionId: string,
  ): Promise<DbSchemaResult> {
    const provider = await getProvider(workspaceId, connectionId);
    return provider.getSchema(connectionId);
  },

  // ── Query ─────────────────────────────────────────────────────────────────

  async query(
    workspaceId: string,
    connectionId: string,
    sql: string,
  ): Promise<DbQueryResult> {
    const provider = await getProvider(workspaceId, connectionId);
    return provider.query(sql);
  },
};
