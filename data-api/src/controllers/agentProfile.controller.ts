import { spawn } from "child_process";
import type { Request, Response } from "express";
import { CreateAgentProfileSchema, PatchAgentProfileSchema } from "../schemas/agentProfile.schema";
import * as agentProfileService from "../services/agentProfile.service";

export async function listAgentProfiles(_req: Request, res: Response) {
  const profiles = await agentProfileService.listAgentProfiles();
  res.json(profiles);
}

export async function createAgentProfile(req: Request, res: Response) {
  const parsed = CreateAgentProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const profile = await agentProfileService.createAgentProfile(parsed.data);
  return res.status(201).json(profile);
}

export async function getAgentProfile(req: Request, res: Response) {
  const profile = await agentProfileService.getAgentProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: "Not found" });
  return res.json(profile);
}

export async function patchAgentProfile(req: Request, res: Response) {
  const parsed = PatchAgentProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await agentProfileService.patchAgentProfile(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteAgentProfile(req: Request, res: Response) {
  await agentProfileService.deleteAgentProfile(req.params.id);
  res.status(204).send();
}

interface DiscoveredTool {
  name: string;
  description?: string;
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  result?: unknown;
  error?: { message?: string };
  params?: unknown;
}

/**
 * Spawns a stdio MCP server process, performs the MCP handshake, and fetches
 * the tools list via JSON-RPC over stdin/stdout.
 */
async function discoverStdioTools(
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<DiscoveredTool[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let requestIdCounter = 0;
    const pending = new Map<number, (result: unknown) => void>();

    const send = (msg: object): void => {
      child.stdin.write(JSON.stringify(msg) + "\n");
    };

    const request = (method: string, params: object): Promise<unknown> =>
      new Promise((res, rej) => {
        const id = ++requestIdCounter;
        pending.set(id, res);
        send({ jsonrpc: "2.0", id, method, params });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rej(new Error(`MCP request '${method}' timed out`));
          }
        }, 8_000);
      });

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcMessage;
          if (msg.id !== undefined && pending.has(msg.id)) {
            const cb = pending.get(msg.id)!;
            pending.delete(msg.id);
            cb(msg.result);
          }
        } catch {
          // ignore unparseable lines (e.g. startup logs on stdout)
        }
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn process: ${err.message}`));
    });

    const run = async (): Promise<void> => {
      try {
        await request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "swe-ai-discovery", version: "1.0" },
        });
        send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
        const result = (await request("tools/list", {})) as { tools?: DiscoveredTool[] } | null;
        const tools: DiscoveredTool[] = (result?.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
        }));
        resolve(tools);
      } catch (err) {
        reject(err);
      } finally {
        child.kill();
      }
    };

    run();
  });
}

/**
 * POST /agent-profiles/mcp-discover
 * Discovers tools from an MCP server.
 * - streamable-http: proxies a tools/list JSON-RPC call to the server URL.
 * - stdio: spawns the process and negotiates the MCP handshake over stdin/stdout.
 */
export async function discoverMcpTools(req: Request, res: Response) {
  const { transport, url, headers, command, args, env } = req.body as {
    transport?: string;
    url?: string;
    headers?: Record<string, string>;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };

  // ── stdio ──────────────────────────────────────────────────────────────────
  if (transport === "stdio") {
    if (!command) {
      return res.status(400).json({ error: "command is required for stdio transport" });
    }
    try {
      const tools = await discoverStdioTools(command, args ?? [], env ?? {});
      return res.json({ tools });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(502).json({ error: `Failed to discover stdio tools: ${message}` });
    }
  }

  // ── streamable-http ────────────────────────────────────────────────────────
  if (transport === "streamable-http") {
    if (!url) {
      return res.status(400).json({ error: "url is required for streamable-http transport" });
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(headers ?? {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return res.status(502).json({ error: `MCP server responded with ${response.status}` });
      }

      const json = (await response.json()) as {
        result?: { tools?: DiscoveredTool[] };
        error?: { message?: string };
      };

      if (json.error) {
        return res.status(502).json({ error: json.error.message ?? "MCP server error" });
      }

      const tools: DiscoveredTool[] = (json.result?.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
      }));

      return res.json({ tools });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(502).json({ error: `Failed to reach MCP server: ${message}` });
    }
  }

  return res.status(400).json({ error: `Unsupported transport: ${transport ?? "(none)"}` });
}
