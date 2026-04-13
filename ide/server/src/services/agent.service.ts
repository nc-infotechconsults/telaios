// ─── Agent Service ─────────────────────────────────────────────────────────────
//
// Manages the OpenCode SDK lifecycle and exposes a clean async API
// over it. On initialization it either:
//   A) Connects to an existing OpenCode server (OPENCODE_SERVER_URL set)
//   B) Starts an embedded OpenCode server (default)
//
// All operations gracefully degrade when OpenCode is unavailable.
// Routes should call isAvailable() before calling service methods and
// return 503 when false.
// ──────────────────────────────────────────────────────────────────────────────

import {
  createOpencodeClient,
  createOpencode,
  type OpencodeClient,
  type TextPartInput,
  type Event,
  type GlobalEvent,
} from "@opencode-ai/sdk";
import { config } from "@/core/config";

// ─── Error ────────────────────────────────────────────────────────────────────

export class AgentUnavailableError extends Error {
  readonly statusCode = 503;

  constructor() {
    super(
      "OpenCode agent service is not available. " +
        "Set OPENCODE_SERVER_URL to connect to an existing server, " +
        "or ensure the opencode binary is installed for embedded mode.",
    );
    this.name = "AgentUnavailableError";
  }
}

// ─── Session ID extraction ────────────────────────────────────────────────────
//
// Different event types carry the session ID in different locations.
// This helper normalises the extraction so the filter works for all events.

function extractSessionId(event: Event): string | undefined {
  const p = (event as { properties?: Record<string, unknown> }).properties;
  if (!p) return undefined;

  // Direct field: session.status, session.idle, session.compacted,
  //               message.removed, message.part.removed, etc.
  if (typeof p.sessionID === "string") return p.sessionID;

  // message.updated — properties.info is a Message which has sessionID
  const info = p.info as Record<string, unknown> | undefined;
  if (typeof info?.sessionID === "string") return info.sessionID;

  // message.part.updated — properties.part is a Part which has sessionID
  const part = p.part as Record<string, unknown> | undefined;
  if (typeof part?.sessionID === "string") return part.sessionID;

  return undefined;
}

// ─── AgentService ─────────────────────────────────────────────────────────────

class AgentService {
  private client: OpencodeClient | null = null;
  private serverClose: (() => void) | null = null;

  /** Attempt to start/connect to OpenCode. Safe to call multiple times. */
  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      if (config.OPENCODE_SERVER_URL) {
        this.client = createOpencodeClient({
          baseUrl: config.OPENCODE_SERVER_URL,
        });
        console.log(
          `[agent] Connected to OpenCode server at ${config.OPENCODE_SERVER_URL}`,
        );
      } else {
        const { client, server } = await createOpencode();
        this.client = client;
        this.serverClose = server.close;
        console.log("[agent] Started embedded OpenCode server");
      }
    } catch (err) {
      console.error(
        "[agent] Failed to initialize OpenCode (agent features will be unavailable):",
        err,
      );
      this.client = null;
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  private getClient(): OpencodeClient {
    if (!this.client) throw new AgentUnavailableError();
    return this.client;
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  async getHealth(): Promise<{
    status: "connected" | "disconnected" | "error";
    url?: string;
  }> {
    if (!this.client) return { status: "disconnected" };
    try {
      await this.client.session.list();
      return {
        status: "connected",
        url: config.OPENCODE_SERVER_URL ?? "embedded",
      };
    } catch {
      return { status: "error" };
    }
  }

  // ── Sessions ────────────────────────────────────────────────────────────────

  async listSessions() {
    const { data } = await this.getClient().session.list();
    return data ?? [];
  }

  async createSession(title?: string) {
    const { data } = await this.getClient().session.create({
      body: { title },
    });
    if (!data) throw new Error("Failed to create session — no data returned");
    return data;
  }

  async getSession(id: string) {
    const { data } = await this.getClient().session.get({ path: { id } });
    if (!data) throw new Error(`Session ${id} not found`);
    return data;
  }

  async deleteSession(id: string): Promise<void> {
    await this.getClient().session.delete({ path: { id } });
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  async getMessages(sessionId: string) {
    const { data } = await this.getClient().session.messages({
      path: { id: sessionId },
    });
    return data ?? [];
  }

  // ── Prompt ──────────────────────────────────────────────────────────────────

  /**
   * Send a prompt to a session asynchronously.
   * Returns immediately (202); subscribe to events to see the response.
   */
  async promptAsync(
    sessionId: string,
    parts: TextPartInput[],
  ): Promise<void> {
    await this.getClient().session.promptAsync({
      path: { id: sessionId },
      body: { parts },
    });
  }

  // ── Abort ───────────────────────────────────────────────────────────────────

  async abort(sessionId: string): Promise<void> {
    await this.getClient().session.abort({ path: { id: sessionId } });
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  /**
   * Returns an async generator that yields GlobalEvents filtered to the
   * given session. Each caller opens its own connection to OpenCode's
   * global event stream.
   */
  async sessionEventStream(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<GlobalEvent, void, unknown>> {
    const { stream } = await this.getClient().global.event({
      ...(signal && { signal })
    });

    async function* filter(
      source: typeof stream,
    ): AsyncGenerator<GlobalEvent, void, unknown> {
      try {
        for await (const event of source) {
          if (signal?.aborted) break;
          const type = event.payload.type;
          // Always forward session lifecycle events — their sessionID is the
          // newly created/updated session, not the subscriber's session.
          // The client needs these to keep the session list up-to-date.
          if (type === "session.created" || type === "session.updated") {
            yield event;
            continue;
          }
          const sid = extractSessionId(event.payload);
          // Yield if event has no session context (global) or matches our session
          if (sid === undefined || sid === sessionId) {
            yield event;
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError" || signal?.aborted) {
          // Graceful exit on abort
          return;
        }
        throw err;
      }
    }

    return filter(stream);
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  async getConfig() {
    const { data } = await this.getClient().config.get();
    return data;
  }

  async getProviders() {
    const { data } = await this.getClient().config.providers();
    return data;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  close(): void {
    this.serverClose?.();
    this.serverClose = null;
    this.client = null;
  }
}

export const agentService = new AgentService();
