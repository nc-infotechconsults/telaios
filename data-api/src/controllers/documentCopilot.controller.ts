/**
 * Document Copilot controller — proxies requests to agent-service.
 *
 * The agent-service owns all LLM logic. data-api acts as an authenticated
 * gateway so the frontend only needs to talk to one service.
 */
import { Request, Response } from "express";
import logger from "../utils/logger";

function agentServiceUrl(): string {
  return process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
}

function internalKey(): string {
  return process.env.INTERNAL_API_KEY ?? "";
}

async function proxyPost(
  path: string,
  body: unknown,
  res: Response,
): Promise<void> {
  const url = `${agentServiceUrl()}${path}`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalKey()}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data: unknown = await upstream.json();

    if (!upstream.ok) {
      const errDetail = (data as { detail?: string })?.detail ?? "Agent service error";
      res.status(upstream.status).json({ error: errDetail });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    logger.error({ err, path }, "Document copilot proxy failed");
    res.status(502).json({ error: "Could not reach agent service" });
  }
}

export async function summarize(req: Request, res: Response) {
  const { projectId, id } = req.params;
  await proxyPost(
    `/projects/${projectId}/documents/${id}/copilot/summarize`,
    null,
    res,
  );
}

export async function ask(req: Request, res: Response) {
  const { projectId, id } = req.params;
  const { question } = req.body as { question?: string };
  if (!question?.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }
  await proxyPost(
    `/projects/${projectId}/documents/${id}/copilot/ask`,
    { question },
    res,
  );
}

export async function extract(req: Request, res: Response) {
  const { projectId, id } = req.params;
  await proxyPost(
    `/projects/${projectId}/documents/${id}/copilot/extract`,
    null,
    res,
  );
}
