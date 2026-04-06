import { Router } from "express";
import { sseManager } from "../services/sseManager";
import { handleUserMessage, initSession } from "../services/planningService";

const router = Router();

// SSE stream — client subscribes here; greeting is auto-sent for new sessions
router.get("/:planId/stream", (req, res) => {
  const { planId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  sseManager.register(planId, res);

  initSession(planId).catch((err) => {
    console.error(`Failed to init session for plan ${planId}:`, err);
    sseManager.broadcast(planId, { type: "error", message: String(err) });
  });

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 20_000);

  res.on("close", () => {
    clearInterval(heartbeat);
  });
});

// Message endpoint — client posts user messages here
router.post("/:planId/message", async (req, res) => {
  const { planId } = req.params;
  const { content } = req.body as { content?: string };

  if (!content?.trim()) {
    return res.status(400).json({ error: "content is required" });
  }

  handleUserMessage(planId, content).catch((err) => {
    console.error(`Planning error for plan ${planId}:`, err);
    sseManager.broadcast(planId, { type: "error", message: String(err) });
  });

  return res.status(202).json({ ok: true });
});

export default router;
