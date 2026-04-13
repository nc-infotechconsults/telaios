// ─── Agent Routes ──────────────────────────────────────────────────────────────
//
// Proxy layer between the IDE client and the OpenCode SDK.
//
// All routes check agentService.isAvailable() and return 503 when
// OpenCode is not running or could not be initialized.
//
// SSE events:
//   GET /api/agent/sessions/:id/events
//   Streams GlobalEvents (filtered to the session) as Server-Sent Events.
//   Each SSE message has:
//     event: <event.payload.type>
//     data:  JSON.stringify(event)
// ──────────────────────────────────────────────────────────────────────────────

import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { agentService, AgentUnavailableError } from "@/services/agent.service";

const app = new Hono();

// ─── 503 guard ────────────────────────────────────────────────────────────────

function unavailable(c: Context) {
  return c.json(
    {
      error: {
        code: "AGENT_UNAVAILABLE",
        message:
          "OpenCode agent service is not available. " +
          "Check server logs for initialization errors.",
      },
    },
    503,
  );
}

// ─── Health ────────────────────────────────────────────────────────────────────
// GET /api/agent/health

app.get("/health", async (c) => {
  const health = await agentService.getHealth();
  return c.json({ data: health }, health.status === "connected" ? 200 : 503);
});

// ─── Config ────────────────────────────────────────────────────────────────────
// GET /api/agent/config

app.get("/config", async (c) => {
  if (!agentService.isAvailable()) return unavailable(c);
  try {
    const [cfg, providers] = await Promise.all([
      agentService.getConfig(),
      agentService.getProviders(),
    ]);
    return c.json({ data: { config: cfg, providers } });
  } catch (err) {
    if (err instanceof AgentUnavailableError) return unavailable(c);
    throw err;
  }
});

// ─── Sessions ──────────────────────────────────────────────────────────────────

// GET /api/agent/sessions
app.get("/sessions", async (c) => {
  if (!agentService.isAvailable()) return unavailable(c);
  try {
    const sessions = await agentService.listSessions();
    return c.json({ data: sessions });
  } catch (err) {
    if (err instanceof AgentUnavailableError) return unavailable(c);
    throw err;
  }
});

// POST /api/agent/sessions  Body: { title? }
app.post(
  "/sessions",
  zValidator("json", z.object({ title: z.string().optional() })),
  async (c) => {
    if (!agentService.isAvailable()) return unavailable(c);
    try {
      const { title } = c.req.valid("json");
      const session = await agentService.createSession(title);
      return c.json({ data: session }, 201);
    } catch (err) {
      if (err instanceof AgentUnavailableError) return unavailable(c);
      throw err;
    }
  },
);

// GET /api/agent/sessions/:id
app.get("/sessions/:id", async (c) => {
  if (!agentService.isAvailable()) return unavailable(c);
  try {
    const session = await agentService.getSession(c.req.param("id"));
    return c.json({ data: session });
  } catch (err) {
    if (err instanceof AgentUnavailableError) return unavailable(c);
    throw err;
  }
});

// DELETE /api/agent/sessions/:id
app.delete("/sessions/:id", async (c) => {
  if (!agentService.isAvailable()) return unavailable(c);
  try {
    await agentService.deleteSession(c.req.param("id"));
    return c.json({ data: { deleted: true } });
  } catch (err) {
    if (err instanceof AgentUnavailableError) return unavailable(c);
    throw err;
  }
});

// GET /api/agent/sessions/:id/messages
app.get("/sessions/:id/messages", async (c) => {
  if (!agentService.isAvailable()) return unavailable(c);
  try {
    const messages = await agentService.getMessages(c.req.param("id"));
    return c.json({ data: messages });
  } catch (err) {
    if (err instanceof AgentUnavailableError) return unavailable(c);
    throw err;
  }
});

// POST /api/agent/sessions/:id/prompt
// Body: { parts: Array<{ type: "text"; text: string }> }
// Returns 202 — subscribe to /events for streaming response.
app.post(
  "/sessions/:id/prompt",
  zValidator(
    "json",
    z.object({
      parts: z
        .array(
          z.object({
            type: z.literal("text"),
            text: z.string().min(1),
          }),
        )
        .min(1),
    }),
  ),
  async (c) => {
    if (!agentService.isAvailable()) return unavailable(c);
    try {
      const { parts } = c.req.valid("json");
      await agentService.promptAsync(c.req.param("id"), parts);
      return c.json({ data: { accepted: true } }, 202);
    } catch (err) {
      if (err instanceof AgentUnavailableError) return unavailable(c);
      throw err;
    }
  },
);

// POST /api/agent/sessions/:id/abort
app.post("/sessions/:id/abort", async (c) => {
  if (!agentService.isAvailable()) return unavailable(c);
  try {
    await agentService.abort(c.req.param("id"));
    return c.json({ data: { aborted: true } });
  } catch (err) {
    if (err instanceof AgentUnavailableError) return unavailable(c);
    throw err;
  }
});

// ─── SSE Event stream ──────────────────────────────────────────────────────────
// GET /api/agent/sessions/:id/events
//
// Streams Server-Sent Events for the given session.
// Event format:
//   event: <payload.type>   (e.g. "message.part.updated")
//   data:  JSON string of the full GlobalEvent

app.get("/sessions/:id/events", async (c) => {
  if (!agentService.isAvailable()) return unavailable(c);

  const sessionId = c.req.param("id");

  return streamSSE(
    c,
    async (stream) => {
      let gen: AsyncGenerator<import("@opencode-ai/sdk").GlobalEvent, void, unknown> | null =
        null;

      try {
        gen = await agentService.sessionEventStream(sessionId, c.req.raw.signal);

        // Send an initial "connected" ping so the client knows the stream is live
        await stream.writeSSE({
          event: "connected",
          data: JSON.stringify({ sessionId }),
        });

        for await (const event of gen) {
          if (stream.aborted) break;
          await stream.writeSSE({
            event: event.payload.type,
            data: JSON.stringify(event),
          });
        }
      } catch (err) {
        if (!stream.aborted) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              message:
                err instanceof Error ? err.message : "Stream error",
            }),
          });
        }
      }
    },
    async (err) => {
      console.error("[agent] SSE stream error:", err);
    },
  );
});

export default app;
