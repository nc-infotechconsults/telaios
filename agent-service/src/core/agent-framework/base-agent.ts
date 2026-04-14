import { AgentContext } from "./context";
import type { AgentResult } from "../../agents/coordinator/drivers/base";

// ── Status machine ─────────────────────────────────────────────────────────────
//
//   idle ──→ initializing ──→ ready ──→ running ──→ ready   (loop back)
//                │                        │
//                └──→ error               └──→ error
//   Any state ──→ stopped

export type AgentStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "running"
  | "error"
  | "stopped";

export type { AgentResult };

/**
 * Abstract base class for all agents in the platform.
 *
 * Subclasses must implement three lifecycle hooks:
 *  - `onInit(ctx)`    – one-time setup (load config, warm up connections, etc.)
 *  - `onExecute(ctx)` – the main work for a single execution cycle
 *  - `onCleanup()`    – release resources (close connections, flush buffers, etc.)
 *
 * The public surface (`init`, `execute`, `cleanup`) wraps these hooks with
 * status transitions and error handling so subclasses stay focused on logic.
 */
export abstract class BaseAgent {
  private _status: AgentStatus = "idle";

  /**
   * Structured result produced by the last successful `execute()` call.
   * Subclasses set this inside `onExecute()` so callers can retrieve the
   * outcome without coupling to agent-specific return types.
   */
  protected _result: AgentResult | null = null;

  constructor(
    /** Unique instance identifier (e.g. UUID from the agent pool). */
    public readonly id: string,
    /** Agent type label used by the registry (e.g. "coder", "reviewer"). */
    public readonly type: string,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  getStatus(): AgentStatus {
    return this._status;
  }

  /**
   * Returns the result of the last successful `execute()` call, or `null`
   * if the agent hasn't executed yet (or failed).
   */
  getResult(): AgentResult | null {
    return this._result;
  }

  /**
   * Initialise the agent. Safe to call multiple times — subsequent calls while
   * already `ready` are no-ops; calls while `running` throw.
   */
  async init(ctx: AgentContext): Promise<void> {
    if (this._status === "ready") return;
    if (this._status === "running") {
      throw new Error(`Agent ${this.id} is already running; cannot re-init.`);
    }
    this._status = "initializing";
    try {
      await this.onInit(ctx);
      this._status = "ready";
    } catch (err) {
      this._status = "error";
      throw err;
    }
  }

  /**
   * Execute the agent's main logic for the given context.
   * The agent must be in `ready` status before calling this.
   */
  async execute(ctx: AgentContext): Promise<void> {
    if (this._status !== "ready") {
      throw new Error(
        `Agent ${this.id} must be in "ready" state to execute (current: ${this._status}).`,
      );
    }
    this._status = "running";
    try {
      await this.onExecute(ctx);
      this._status = "ready";
    } catch (err) {
      this._status = "error";
      throw err;
    }
  }

  /**
   * Release all resources held by this agent instance.
   * Safe to call from any status; transitions to `stopped`.
   */
  async cleanup(): Promise<void> {
    try {
      await this.onCleanup();
    } finally {
      this._status = "stopped";
    }
  }

  // ── Lifecycle hooks (implement in subclasses) ───────────────────────────────

  protected abstract onInit(ctx: AgentContext): Promise<void>;
  protected abstract onExecute(ctx: AgentContext): Promise<void>;
  protected abstract onCleanup(): Promise<void>;
}
