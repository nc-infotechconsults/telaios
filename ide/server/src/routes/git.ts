import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { GitService } from "@/services/git.service";

const app = new Hono();

// ── Status ────────────────────────────────────────────────────────────────────
// GET /api/git/:id/status
app.get("/:id/status", async (c) => {
  const status = await GitService.status(c.req.param("id"));
  return c.json({ data: status });
});

// ── Branches ──────────────────────────────────────────────────────────────────
// GET /api/git/:id/branches
app.get("/:id/branches", async (c) => {
  const branches = await GitService.branches(c.req.param("id"));
  return c.json({ data: branches });
});

// ── Checkout ──────────────────────────────────────────────────────────────────
// POST /api/git/:id/checkout
app.post(
  "/:id/checkout",
  zValidator(
    "json",
    z.object({
      branch: z.string().min(1),
      create: z.boolean().default(false),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { branch, create } = c.req.valid("json");
    await GitService.checkout(id, branch, create);
    return c.json({ data: { branch } });
  },
);

// ── Stage ─────────────────────────────────────────────────────────────────────
// POST /api/git/:id/stage
app.post(
  "/:id/stage",
  zValidator("json", z.object({ paths: z.array(z.string()).min(1) })),
  async (c) => {
    const { id } = c.req.param();
    const { paths } = c.req.valid("json");
    await GitService.stage(id, paths);
    return c.json({ data: { staged: paths } });
  },
);

// ── Stage all ─────────────────────────────────────────────────────────────────
// POST /api/git/:id/stage-all
app.post("/:id/stage-all", async (c) => {
  await GitService.stageAll(c.req.param("id"));
  return c.json({ data: { staged: "all" } });
});

// ── Unstage ───────────────────────────────────────────────────────────────────
// POST /api/git/:id/unstage
app.post(
  "/:id/unstage",
  zValidator("json", z.object({ paths: z.array(z.string()).min(1) })),
  async (c) => {
    const { id } = c.req.param();
    const { paths } = c.req.valid("json");
    await GitService.unstage(id, paths);
    return c.json({ data: { unstaged: paths } });
  },
);

// ── Commit ────────────────────────────────────────────────────────────────────
// POST /api/git/:id/commit
app.post(
  "/:id/commit",
  zValidator(
    "json",
    z.object({
      message: z.string().min(1),
      authorName: z.string().optional(),
      authorEmail: z.string().email().optional(),
      amend: z.boolean().default(false),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { message, authorName, authorEmail, amend } = c.req.valid("json");
    await GitService.commit(id, message, { authorName, authorEmail, amend });
    return c.json({ data: { committed: true } });
  },
);

// ── Push ──────────────────────────────────────────────────────────────────────
// POST /api/git/:id/push
app.post(
  "/:id/push",
  zValidator(
    "json",
    z
      .object({ remote: z.string().default("origin"), branch: z.string().optional() })
      .optional(),
  ),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    await GitService.push(id, body?.remote ?? "origin", body?.branch);
    return c.json({ data: { pushed: true } });
  },
);

// ── Pull ──────────────────────────────────────────────────────────────────────
// POST /api/git/:id/pull
app.post(
  "/:id/pull",
  zValidator(
    "json",
    z.object({ remote: z.string().default("origin") }).optional(),
  ),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    await GitService.pull(id, body?.remote ?? "origin");
    return c.json({ data: { pulled: true } });
  },
);

// ── Diff ──────────────────────────────────────────────────────────────────────
// GET /api/git/:id/diff?file=src/index.ts&staged=false
app.get(
  "/:id/diff",
  zValidator(
    "query",
    z.object({
      file: z.string().optional(),
      staged: z
        .string()
        .transform((v) => v === "true")
        .default("false"),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { file, staged } = c.req.valid("query");
    const diff = await GitService.diff(id, file, staged);
    return c.json({ data: { diff } });
  },
);

// ── Log ───────────────────────────────────────────────────────────────────────
// GET /api/git/:id/log?limit=50
app.get(
  "/:id/log",
  zValidator("query", z.object({ limit: z.coerce.number().default(50) })),
  async (c) => {
    const { id } = c.req.param();
    const { limit } = c.req.valid("query");
    const commits = await GitService.log(id, limit);
    return c.json({ data: commits, total: commits.length });
  },
);

// ── File at ref ───────────────────────────────────────────────────────────────
// GET /api/git/:id/file-at-ref?path=src/index.ts&ref=HEAD
app.get(
  "/:id/file-at-ref",
  zValidator(
    "query",
    z.object({
      path: z.string().min(1),
      ref: z.string().min(1),
    }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { path, ref } = c.req.valid("query");
    const content = await GitService.fileAtRef(id, path, ref);
    return c.json({ data: { content } });
  },
);

// ── Stash list ────────────────────────────────────────────────────────────────
// GET /api/git/:id/stash
app.get("/:id/stash", async (c) => {
  const stashes = await GitService.stashList(c.req.param("id"));
  return c.json({ data: stashes });
});

// ── Stash push ────────────────────────────────────────────────────────────────
// POST /api/git/:id/stash
app.post(
  "/:id/stash",
  zValidator(
    "json",
    z.object({ message: z.string().optional() }).optional(),
  ),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    await GitService.stashPush(id, body?.message);
    return c.json({ data: { stashed: true } });
  },
);

// ── Stash pop ─────────────────────────────────────────────────────────────────
// POST /api/git/:id/stash/pop
app.post(
  "/:id/stash/pop",
  zValidator(
    "json",
    z.object({ index: z.string().optional() }).optional(),
  ),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    await GitService.stashPop(id, body?.index);
    return c.json({ data: { popped: true } });
  },
);

// ── Stash drop ────────────────────────────────────────────────────────────────
// POST /api/git/:id/stash/drop
app.post(
  "/:id/stash/drop",
  zValidator(
    "json",
    z.object({ index: z.string().min(1) }),
  ),
  async (c) => {
    const { id } = c.req.param();
    const { index } = c.req.valid("json");
    await GitService.stashDrop(id, index);
    return c.json({ data: { dropped: true } });
  },
);

// ── Discard ───────────────────────────────────────────────────────────────────
// POST /api/git/:id/discard
app.post(
  "/:id/discard",
  zValidator("json", z.object({ paths: z.array(z.string()).min(1) })),
  async (c) => {
    const { id } = c.req.param();
    const { paths } = c.req.valid("json");
    await GitService.discard(id, paths);
    return c.json({ data: { discarded: paths } });
  },
);

// ── Show commit ───────────────────────────────────────────────────────────────
// GET /api/git/:id/show/:hash
app.get("/:id/show/:hash", async (c) => {
  const { id, hash } = c.req.param();
  const detail = await GitService.showCommit(id, hash);
  return c.json({ data: detail });
});

// ── Clone ─────────────────────────────────────────────────────────────────────
// POST /api/git/clone
app.post(
  "/clone",
  zValidator(
    "json",
    z.object({
      workspaceId: z.string().min(1),
      url: z.string().url(),
      branch: z.string().optional(),
    }),
  ),
  async (c) => {
    const { workspaceId, url, branch } = c.req.valid("json");
    await GitService.clone(url, workspaceId, branch);
    return c.json({ data: { cloned: true } });
  },
);

export default app;
