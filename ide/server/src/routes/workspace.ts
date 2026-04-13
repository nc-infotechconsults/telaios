import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { WorkspaceService } from "@/services/workspace.service";
import { WorkspaceRegistry } from "@/services/workspaceRegistry.service";

const app = new Hono();

// ── Workspace metadata (registry) ─────────────────────────────────────────────

// GET /api/workspaces
app.get("/", async (c) => {
  const workspaces = await WorkspaceRegistry.list();
  return c.json({ data: workspaces, total: workspaces.length });
});

// POST /api/workspaces
app.post(
  "/",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1),
      source: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("git"),
          url: z.string().url(),
          branch: z.string().optional(),
        }),
        z.object({
          type: z.literal("s3"),
          bucket: z.string().min(1),
          prefix: z.string().optional(),
        }),
      ]),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const ws = await WorkspaceRegistry.create(body);
    return c.json({ data: ws }, 201);
  },
);

// GET /api/workspaces/:id
app.get("/:id", async (c) => {
  const ws = await WorkspaceRegistry.get(c.req.param("id"));
  return c.json({ data: ws });
});

// DELETE /api/workspaces/:id
app.delete("/:id", async (c) => {
  await WorkspaceRegistry.delete(c.req.param("id"));
  return c.json({ data: { deleted: true } });
});

// ── List directory ─────────────────────────────────────────────────────────────
// GET /api/workspaces/:id/files?path=src/components
app.get(
  "/:id/files",
  zValidator(
    "query",
    z.object({ path: z.string().default(".") }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { path } = c.req.valid("query");
    const entries = await WorkspaceService.listDir(id, path);
    return c.json({ data: entries });
  },
);

// ── Read file ─────────────────────────────────────────────────────────────────
// GET /api/workspaces/:id/file?path=src/index.ts
app.get(
  "/:id/file",
  zValidator("query", z.object({ path: z.string().min(1) })),
  async (c) => {
    const { id } = c.req.param();
    const { path } = c.req.valid("query");
    const result = await WorkspaceService.readFile(id, path);
    return c.json({ data: result });
  },
);

// ── Write file ────────────────────────────────────────────────────────────────
// PUT /api/workspaces/:id/file
app.put(
  "/:id/file",
  zValidator(
    "json",
    z.object({
      path: z.string().min(1),
      content: z.string(),
      encoding: z.enum(["utf8", "base64"]).default("utf8"),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { path, content, encoding } = c.req.valid("json");
    await WorkspaceService.writeFile(id, path, content, encoding);
    return c.json({ data: { path } });
  },
);

// ── Delete file / directory ───────────────────────────────────────────────────
// DELETE /api/workspaces/:id/file?path=src/old.ts
app.delete(
  "/:id/file",
  zValidator("query", z.object({ path: z.string().min(1) })),
  async (c) => {
    const { id } = c.req.param();
    const { path } = c.req.valid("query");
    await WorkspaceService.deleteFile(id, path);
    return c.json({ data: { deleted: true } });
  },
);

// ── Rename / move ─────────────────────────────────────────────────────────────
// POST /api/workspaces/:id/rename
app.post(
  "/:id/rename",
  zValidator(
    "json",
    z.object({
      oldPath: z.string().min(1),
      newPath: z.string().min(1),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { oldPath, newPath } = c.req.valid("json");
    await WorkspaceService.renameFile(id, oldPath, newPath);
    return c.json({ data: { oldPath, newPath } });
  },
);

// ── Create directory ──────────────────────────────────────────────────────────
// POST /api/workspaces/:id/mkdir
app.post(
  "/:id/mkdir",
  zValidator("json", z.object({ path: z.string().min(1) })),
  async (c) => {
    const { id } = c.req.param();
    const { path } = c.req.valid("json");
    await WorkspaceService.mkdir(id, path);
    return c.json({ data: { path } });
  },
);

// ── Search ────────────────────────────────────────────────────────────────────
// GET /api/workspaces/:id/search?q=useState&maxResults=100&regex=false&caseSensitive=false&wholeWord=false&include=*.ts&exclude=node_modules/**
app.get(
  "/:id/search",
  zValidator(
    "query",
    z.object({
      q: z.string().min(1),
      maxResults: z.coerce.number().int().min(1).max(500).default(100),
      regex: z.coerce.boolean().default(false),
      caseSensitive: z.coerce.boolean().default(false),
      wholeWord: z.coerce.boolean().default(false),
      include: z.string().optional(),
      exclude: z.string().optional(),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { q, maxResults, regex, caseSensitive, wholeWord, include, exclude } =
      c.req.valid("query");
    const results = await WorkspaceService.search(id, q, {
      maxResults,
      regex,
      caseSensitive,
      wholeWord,
      include,
      exclude,
    });
    return c.json({ data: results, total: results.length });
  },
);

// ── Search & Replace ──────────────────────────────────────────────────────────
// POST /api/workspaces/:id/search-replace
app.post(
  "/:id/search-replace",
  zValidator(
    "json",
    z.object({
      query: z.string().min(1),
      replacement: z.string(),
      regex: z.boolean().default(false),
      caseSensitive: z.boolean().default(false),
      wholeWord: z.boolean().default(false),
      include: z.string().optional(),
      exclude: z.string().optional(),
      filePaths: z.array(z.string()).optional(),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const result = await WorkspaceService.searchReplace(id, body.query, body.replacement, {
      regex: body.regex,
      caseSensitive: body.caseSensitive,
      wholeWord: body.wholeWord,
      include: body.include,
      exclude: body.exclude,
      filePaths: body.filePaths,
    });
    return c.json({ data: result });
  },
);

// ── Create file ────────────────────────────────────────────────────────────────
// POST /api/workspaces/:id/create-file
app.post(
  "/:id/create-file",
  zValidator(
    "json",
    z.object({
      dirPath: z.string().default("."),
      filename: z.string().min(1),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { dirPath, filename } = c.req.valid("json");
    await WorkspaceService.createFile(id, dirPath, filename);
    return c.json({ data: { dirPath, filename } });
  },
);

// ── Create folder ────────────────────────────────────────────────────────────
// POST /api/workspaces/:id/create-folder
app.post(
  "/:id/create-folder",
  zValidator(
    "json",
    z.object({
      dirPath: z.string().default("."),
      foldername: z.string().min(1),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { dirPath, foldername } = c.req.valid("json");
    await WorkspaceService.createFolder(id, dirPath, foldername);
    return c.json({ data: { dirPath, foldername } });
  },
);

// ── Delete entry ──────────────────────────────────────────────────────
// DELETE /api/workspaces/:id/entry?path=src/file.ts
app.delete(
  "/:id/entry",
  zValidator("query", z.object({ path: z.string().min(1) })),
  async (c) => {
    const { id } = c.req.param();
    const { path } = c.req.valid("query");
    await WorkspaceService.deleteEntry(id, path);
    return c.json({ data: { deleted: true } });
  },
);

// ── Rename entry ────────────────────────────────────────────────────
// POST /api/workspaces/:id/rename-entry
app.post(
  "/:id/rename-entry",
  zValidator(
    "json",
    z.object({
      oldPath: z.string().min(1),
      newPath: z.string().min(1),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { oldPath, newPath } = c.req.valid("json");
    await WorkspaceService.renameEntry(id, oldPath, newPath);
    return c.json({ data: { oldPath, newPath } });
  },
);

export default app;
