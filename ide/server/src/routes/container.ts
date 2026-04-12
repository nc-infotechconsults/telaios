import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ContainerService } from "@/services/container.service";

const app = new Hono();

// ── Status ────────────────────────────────────────────────────────────────────
// GET /api/containers/:id/status
app.get("/:id/status", async (c) => {
  const status = await ContainerService.status(c.req.param("id"));
  return c.json({ data: { status } });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// POST /api/containers/:id/start
app.post(
  "/:id/start",
  zValidator(
    "json",
    z.object({ image: z.string().optional() }).optional(),
  ),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const info = await ContainerService.start(id, body?.image);
    return c.json({ data: info });
  },
);

// ── Stop ──────────────────────────────────────────────────────────────────────
// POST /api/containers/:id/stop
app.post("/:id/stop", async (c) => {
  await ContainerService.stop(c.req.param("id"));
  return c.json({ data: { stopped: true } });
});

// ── Sleep ─────────────────────────────────────────────────────────────────────
// POST /api/containers/:id/sleep
app.post("/:id/sleep", async (c) => {
  await ContainerService.sleep(c.req.param("id"));
  return c.json({ data: { sleeping: true } });
});

// ── Heartbeat ─────────────────────────────────────────────────────────────────
// POST /api/containers/:id/heartbeat
app.post("/:id/heartbeat", (c) => {
  ContainerService.heartbeat(c.req.param("id"));
  return c.json({ data: { ok: true } });
});

export default app;
