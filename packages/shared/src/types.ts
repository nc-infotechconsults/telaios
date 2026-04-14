// ── JSON Schema primitives (subset used for MCP inputSchema / outputSchema) ────

export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "null";

export interface JsonSchemaProperty {
  type: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: (string | number | boolean)[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
}

/** JSON Schema object used as MCP tool inputSchema / outputSchema. */
export interface JsonSchema {
  type: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// ── MCP Tool annotations (per MCP spec §tools) ───────────────────────────────

export interface McpToolAnnotations {
  /** Human-readable title for display purposes. */
  title?: string;
  /** If true, the tool does not modify external state. */
  readOnlyHint?: boolean;
  /** If true, the tool may cause destructive side effects. */
  destructiveHint?: boolean;
  /** If true, repeated calls with the same args have the same effect. */
  idempotentHint?: boolean;
  /** If false, the tool only interacts with its declared inputs/outputs. */
  openWorldHint?: boolean;
}

/** A single MCP content item returned by a tool. */
export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string };

/** The result envelope returned from a tools/call invocation. */
export interface McpToolResult {
  content: McpContent[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

// ── MCP Server configuration ──────────────────────────────────────────────────

export interface McpServer {
  name: string;
  /**
   * Transport mechanism:
   * - `"stdio"` – communicate over stdin/stdout (local process)
   * - `"streamable-http"` – communicate via HTTP POST + optional SSE streaming
   */
  transport: "stdio" | "streamable-http";
  // stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // streamable-http fields
  url?: string;
  /** HTTP headers, e.g. `{ Authorization: "Bearer <token>" }` */
  headers?: Record<string, string>;
}

// ── Skill ─────────────────────────────────────────────────────────────────────

/**
 * A Skill is an MCP-structured tool definition that an agent profile exposes.
 * It follows the MCP tool schema so it can be surfaced via `tools/list` and
 * invoked via `tools/call`.
 */
export interface Skill {
  /** Unique identifier for the tool (snake_case, e.g. "run_tests"). */
  name: string;
  /** Optional human-readable display name. */
  title?: string;
  /** Human-readable description of what the skill does. */
  description: string;
  /** JSON Schema describing the tool's input parameters. */
  inputSchema: JsonSchema;
  /** Optional JSON Schema describing the tool's structured output. */
  outputSchema?: JsonSchema;
  /** Behavioural hints per MCP spec annotations. */
  annotations?: McpToolAnnotations;
  /**
   * Agent-specific instructions (Markdown). Injected into the LLM system
   * prompt to guide how the agent should use / implement this skill.
   */
  instructions: string;
}

// ── Agent roles ───────────────────────────────────────────────────────────────

export type AgentRole =
  | "planner"
  | "coder"
  | "reviewer"
  | "tester"
  | "infra"
  | "knowledge";
