import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { WorkspaceService } from "@/services/workspace.service";
import { WorkspaceRegistry } from "@/services/workspaceRegistry.service";
import { GitService } from "@/services/git.service";
import { config } from "@/core/config";
import path from "node:path";
import fs from "node:fs/promises";

const app = new Hono();

// ── From-project workspace ────────────────────────────────────────────────────
// POST /api/workspaces/from-project
// Creates an IDE workspace from a platform project (multi-repo clone + docs)
app.post(
  "/from-project",
  zValidator(
    "json",
    z.object({
      project_id: z.string().min(1),
      workspace_id: z.string().optional(),
      workspace_name: z.string().min(1),
      platform_api_url: z.string().url(),
      token: z.string().min(1),
      config: z.object({
        repositories: z.record(z.object({
          branch: z.string().optional(),
          enabled: z.boolean().optional(),
        })).optional(),
        env_vars: z.record(z.string()).optional(),
        devcontainer_overrides: z.object({
          image: z.string().optional(),
          postCreateCommand: z.string().optional(),
          extensions: z.array(z.string()).optional(),
        }).optional(),
        default_open_files: z.array(z.string()).optional(),
        agent_profile_id: z.string().optional(),
      }).optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");

    // Fetch project from the platform API
    let projectData: {
      id: string;
      name: string;
      description?: string;
      status: string;
    };
    let repositories: Array<{
      id: string;
      name: string;
      remote_url?: string;
      branch?: string;
      auth_type: string;
    }>;

    try {
      const headers = { Authorization: `Bearer ${body.token}` };
      const [projRes, reposRes] = await Promise.all([
        fetch(`${body.platform_api_url}/projects`, { headers }).then((r) => r.json()),
        fetch(`${body.platform_api_url}/projects/${body.project_id}/repositories`, { headers }).then((r) => r.json()),
      ]);
      const allProjects = projRes as Array<{ id: string; name: string; description?: string; status: string }>;
      projectData = allProjects.find((p) => p.id === body.project_id) ?? { id: body.project_id, name: body.workspace_name, status: "planning" };
      repositories = (reposRes as typeof repositories) ?? [];
    } catch {
      return c.json({ error: "Failed to fetch project from platform API" }, 502);
    }

    // Create an IDE workspace record
    const ws = await WorkspaceRegistry.create({
      name: body.workspace_name,
      source: { type: "platform-project" as unknown as "git", url: body.platform_api_url },
      platformProjectId: body.project_id,
      platformApiUrl: body.platform_api_url,
    });

    const wsRoot = path.join(config.WORKSPACES_ROOT, ws.id);
    await fs.mkdir(wsRoot, { recursive: true });

    // Clone all project repositories in parallel (best-effort)
    const cfgRepos = body.config?.repositories ?? {};
    const cloneResults: Array<{ name: string; status: "ok" | "error"; error?: string }> = [];

    await Promise.allSettled(
      repositories
        .filter((r) => {
          const override = cfgRepos[r.name];
          return override?.enabled !== false;
        })
        .map(async (repo) => {
          if (!repo.remote_url) {
            cloneResults.push({ name: repo.name, status: "error", error: "no remote_url" });
            return;
          }
          const override = cfgRepos[repo.name];
          const branch = override?.branch ?? repo.branch ?? "main";
          const destName = repo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const destPath = path.join(wsRoot, destName);
          try {
            await GitService.clone(repo.remote_url, path.relative(config.WORKSPACES_ROOT, destPath) as unknown as string, branch);
            // GitService.clone uses workspaceId as the sub-path — use simpleGit directly
            const { simpleGit } = await import("simple-git");
            const git = simpleGit();
            await fs.mkdir(destPath, { recursive: true }).catch(() => undefined);
            await git.clone(repo.remote_url, destPath, branch ? ["--branch", branch, "--single-branch"] : []);
            cloneResults.push({ name: repo.name, status: "ok" });
          } catch (err) {
            cloneResults.push({ name: repo.name, status: "error", error: String(err) });
          }
        }),
    );

    // Write .agentscope/project.json manifest
    const manifestDir = path.join(wsRoot, ".agentscope");
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(
      path.join(manifestDir, "project.json"),
      JSON.stringify(
        {
          project_id: body.project_id,
          project_name: projectData.name,
          project_status: projectData.status,
          platform_api_url: body.platform_api_url,
          workspace_id: ws.id,
          platform_workspace_id: body.workspace_id,
          agent_profile_id: body.config?.agent_profile_id,
          repositories: repositories.map((r) => ({
            name: r.name,
            branch: cfgRepos[r.name]?.branch ?? r.branch ?? "main",
            remote_url: r.remote_url,
          })),
          clone_results: cloneResults,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const ideUrl = `${config.CLIENT_URL ?? "http://localhost:5174"}/ide/${ws.id}`;

    return c.json({ data: { ide_workspace_id: ws.id, ide_url: ideUrl } }, 201);
  },
);

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

// POST /api/workspaces/:id/sync — re-pull repos for a platform-project workspace
app.post("/:id/sync", async (c) => {
  const result = await WorkspaceRegistry.syncFromPlatform(c.req.param("id"));
  return c.json({ data: result });
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
