import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { config } from "./core/config";
import chatRouter from "./api/chat";
import { dataClient } from "./services/dataClient";
import { processDocument } from "./services/documentProcessor";
import { startExecution } from "./services/executionService";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/test-llm", async (req, res) => {
  try {
    const { buildChatModel } = await import("./core/llm");
    const settings = await dataClient.getSettings();
    const llm = buildChatModel({
      provider: req.body?.provider ?? settings.llm_provider,
      model: req.body?.model ?? settings.llm_model,
      apiKey: req.body?.apiKey ?? settings.llm_api_key_raw ?? "",
      baseUrl: req.body?.baseUrl ?? settings.llm_base_url,
    });
    const response = await llm.invoke("Say 'Connection OK' and nothing else.");
    res.json({ ok: true, response: response.content });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * POST /documents/:documentId/process
 * Body: { project_id: string }
 * Triggered by data-api after upload — runs the full extraction/embedding pipeline.
 * Responds immediately (202) and processes asynchronously.
 */
app.post("/documents/:documentId/process", (req, res) => {
  const { documentId } = req.params;
  const { project_id } = req.body as { project_id?: string };

  if (!project_id) {
    return res.status(400).json({ error: "project_id is required" });
  }

  // Fire-and-forget — do not await
  void processDocument(documentId, project_id);

  return res.status(202).json({ status: "processing" });
});

app.use("/chat", chatRouter);

/**
 * POST /plans/:planId/resume
 * Body: { project_id: string }
 * Re-launches a Scheduler + AgentPool for a plan in any state.
 * The scheduler reads current DB state, so it naturally skips already-done tasks.
 * Responds 202 immediately; execution is fire-and-forget.
 */
app.post("/plans/:planId/resume", (req, res) => {
  const { planId } = req.params;
  const { project_id } = req.body as { project_id?: string };

  if (!project_id) {
    return res.status(400).json({ error: "project_id is required" });
  }

  void startExecution(project_id, planId);

  return res.status(202).json({ status: "resuming" });
});

app.listen(config.PORT, () => {
  console.log(`Agent Service listening on port ${config.PORT}`);
});
