import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { DatabaseService } from "@/services/db.service";

const app = new Hono();

// ── Shared schemas ─────────────────────────────────────────────────────────────

const connectionBodySchema = z.object({
  name: z.string().min(1),
  driver: z.enum(["postgresql", "sqlite"]),
  // PostgreSQL
  host: z.string().optional(),
  port: z.coerce.number().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  ssl: z.boolean().optional(),
  // SQLite
  filePath: z.string().optional(),
});

// ── List connections ──────────────────────────────────────────────────────────
// GET /api/db/:workspaceId/connections

app.get("/:workspaceId/connections", async (c) => {
  const connections = await DatabaseService.listConnections(
    c.req.param("workspaceId"),
  );
  return c.json({ data: connections });
});

// ── Add connection ────────────────────────────────────────────────────────────
// POST /api/db/:workspaceId/connections

app.post(
  "/:workspaceId/connections",
  zValidator("json", connectionBodySchema),
  async (c) => {
    const conn = await DatabaseService.addConnection(
      c.req.param("workspaceId"),
      c.req.valid("json"),
    );
    return c.json({ data: conn }, 201);
  },
);

// ── Update connection ─────────────────────────────────────────────────────────
// PATCH /api/db/:workspaceId/connections/:connectionId

app.patch(
  "/:workspaceId/connections/:connectionId",
  zValidator("json", connectionBodySchema.partial()),
  async (c) => {
    const conn = await DatabaseService.updateConnection(
      c.req.param("workspaceId"),
      c.req.param("connectionId"),
      c.req.valid("json"),
    );
    return c.json({ data: conn });
  },
);

// ── Delete connection ─────────────────────────────────────────────────────────
// DELETE /api/db/:workspaceId/connections/:connectionId

app.delete("/:workspaceId/connections/:connectionId", async (c) => {
  await DatabaseService.deleteConnection(
    c.req.param("workspaceId"),
    c.req.param("connectionId"),
  );
  return c.json({ data: { deleted: true } });
});

// ── Test connection ───────────────────────────────────────────────────────────
// POST /api/db/:workspaceId/test

app.post(
  "/:workspaceId/test",
  zValidator("json", connectionBodySchema),
  async (c) => {
    const result = await DatabaseService.testConnection(
      c.req.param("workspaceId"),
      c.req.valid("json"),
    );
    return c.json({ data: result });
  },
);

// ── Get schema ────────────────────────────────────────────────────────────────
// GET /api/db/:workspaceId/:connectionId/schema

app.get("/:workspaceId/:connectionId/schema", async (c) => {
  const schema = await DatabaseService.getSchema(
    c.req.param("workspaceId"),
    c.req.param("connectionId"),
  );
  return c.json({ data: schema });
});

// ── Execute query ─────────────────────────────────────────────────────────────
// POST /api/db/:workspaceId/:connectionId/query

app.post(
  "/:workspaceId/:connectionId/query",
  zValidator("json", z.object({ sql: z.string().min(1) })),
  async (c) => {
    const result = await DatabaseService.query(
      c.req.param("workspaceId"),
      c.req.param("connectionId"),
      c.req.valid("json").sql,
    );
    return c.json({ data: result });
  },
);

export default app;
