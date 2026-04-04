import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import expressWs from "express-ws";
import cors from "cors";
import { config } from "./core/config";
import { registerWsRoutes } from "./api/ws";
import { dataClient } from "./services/dataClient";

const { app } = expressWs(express());

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

registerWsRoutes(app as Parameters<typeof registerWsRoutes>[0]);

app.listen(config.PORT, () => {
  console.log(`Agent Service listening on port ${config.PORT}`);
});
