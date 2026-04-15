import { StateGraph, Annotation, END } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { CodingAgentDriver, AgentTask, AgentResult, AgentStatus, AgentArtifact } from "./base";
import type { Skill, McpToolResult, JsonSchema } from "../../../core/types";

const execAsync = promisify(exec);

interface LangGraphDriverConfig {
  llm: BaseChatModel;
  skills: Skill[];
}

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

// ── Built-in MCP tool definitions ────────────────────────────────────────────

const BUILTIN_TOOLS: McpToolDef[] = [
  {
    name: "run_shell",
    description: "Execute a shell command in a workspace directory.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run." },
        cwd: { type: "string", description: "Working directory (absolute path or workspace name)." },
      },
      required: ["command"],
    },
  },
  {
    name: "write_file",
    description: "Write (or overwrite) a file at the given path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the workspace root." },
        content: { type: "string", description: "Full file content to write." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the workspace root." },
      },
      required: ["path"],
    },
  },
  {
    name: "finish",
    description: "Signal that the task is complete and provide a summary.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "A concise summary of what was accomplished." },
      },
      required: ["summary"],
    },
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

const CodingStateAnnotation = Annotation.Root({
  messages: Annotation<Array<{ role: string; content: string; tool_call_id?: string; name?: string }>>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  workspaces: Annotation<Record<string, string>>(),
  result: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  done: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  error: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
});

type CodingState = typeof CodingStateAnnotation.State;

// ── Tool dispatcher ───────────────────────────────────────────────────────────

async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  workspaces: Record<string, string>
): Promise<McpToolResult> {
  const primaryWorkspace = (Object.values(workspaces)[0] as string | undefined) ?? "/tmp";

  const resolveCwd = (cwdArg?: unknown): string => {
    if (typeof cwdArg === "string") {
      // Allow using workspace name as cwd shorthand
      return workspaces[cwdArg] ?? (path.isAbsolute(cwdArg) ? cwdArg : path.join(primaryWorkspace, cwdArg));
    }
    return primaryWorkspace;
  };

  try {
    if (toolName === "run_shell") {
      const cmd = String(args.command);
      const cwd = resolveCwd(args.cwd);
      const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 30_000 });
      return {
        content: [{ type: "text", text: `stdout:\n${stdout}${stderr ? `\nstderr:\n${stderr}` : ""}` }],
        isError: false,
      };
    }

    if (toolName === "write_file") {
      const filePath = path.resolve(primaryWorkspace, String(args.path));
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, String(args.content), "utf-8");
      return { content: [{ type: "text", text: `File written: ${args.path}` }], isError: false };
    }

    if (toolName === "read_file") {
      const filePath = path.resolve(primaryWorkspace, String(args.path));
      const text = await fs.readFile(filePath, "utf-8");
      return { content: [{ type: "text", text }], isError: false };
    }

    if (toolName === "finish") {
      return { content: [{ type: "text", text: String(args.summary) }], isError: false };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Tool error (${toolName}): ${String(err)}` }],
      isError: true,
    };
  }
}

// ── Driver class ──────────────────────────────────────────────────────────────

export class LangGraphDriver implements CodingAgentDriver {
  private status: AgentStatus = "idle";
  private config: LangGraphDriverConfig;

  constructor(cfg: LangGraphDriverConfig) {
    this.config = cfg;
  }

  async getStatus(): Promise<AgentStatus> {
    return this.status;
  }

  async execute(task: AgentTask, workspaces: Record<string, string>): Promise<AgentResult> {
    this.status = "busy";

    // Combine built-in tools with skill-derived tools for the LLM
    const skillTools = this.config.skills.map((s) => ({
      name: s.name,
      description: `${s.description}\n\nInstructions:\n${s.instructions}`,
      inputSchema: s.inputSchema,
    }));

    const allTools = [...BUILTIN_TOOLS, ...skillTools];

    const boundLlm = (this.config.llm as BaseChatModel & {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bindTools?: (tools: typeof allTools) => any;
    }).bindTools?.(allTools) ?? this.config.llm;

    const systemPrompt =
      `You are an expert software engineer. Complete the coding task below using the provided tools.\n\n` +
      `Workspaces (name → path):\n` +
      Object.entries(workspaces).map(([n, p]) => `  ${n}: ${p}`).join("\n") +
      `\n\nTask: ${task.title}\n${task.description}\n\n` +
      `Call tools to read files, run commands, and write code. ` +
      `When the task is fully complete, call the \`finish\` tool with a summary.`;

    try {
      const workflow = this.buildGraph(boundLlm, allTools);
      const finalState = await workflow.invoke({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Begin." },
        ],
        workspaces,
        result: "",
        done: false,
        error: null,
      });

      this.status = "idle";
      const state = finalState as CodingState;

      // Build a tool-call log artifact from the message history
      const artifacts: AgentArtifact[] = [];
      const logLines: string[] = [];
      let toolCallCount = 0;

      for (const msg of state.messages) {
        if (msg.role === "assistant") {
          try {
            const calls = JSON.parse(msg.content) as Array<{
              name: string;
              args: Record<string, unknown>;
              id: string;
            }>;
            if (Array.isArray(calls) && calls.length > 0 && typeof calls[0]?.name === "string") {
              for (const call of calls) {
                toolCallCount++;
                const argsFormatted = JSON.stringify(call.args, null, 2)
                  .split("\n")
                  .join("\n    ");
                logLines.push(`[${toolCallCount}] CALL  ${call.name}`);
                logLines.push(`    args: ${argsFormatted}`);
              }
            }
          } catch {
            // Natural-language assistant message — not a tool call JSON
          }
        } else if (msg.role === "tool") {
          const preview = msg.content.length > 500
            ? `${msg.content.slice(0, 500)}\u2026`
            : msg.content;
          logLines.push(`    \u2192 ${msg.name ?? "result"}: ${preview}`);
          logLines.push("");
        }
      }

      if (logLines.length > 0) {
        artifacts.push({
          type: "log",
          title: `Tool Call Log (${toolCallCount} call${toolCallCount !== 1 ? "s" : ""})`,
          content: logLines.join("\n"),
          content_type: "text/plain",
          metadata: { tool_call_count: toolCallCount },
        });
      }

      return {
        success: !state.error,
        output: state.result,
        error: state.error ?? undefined,
        artifacts,
      };
    } catch (err) {
      this.status = "error";
      return { success: false, output: "", error: String(err) };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildGraph(boundLlm: any, tools: McpToolDef[]) {
    const self = this;

    const workflow = new StateGraph(CodingStateAnnotation)

      // ── think: ask the LLM what to do next ──
      .addNode("think", async (state: CodingState) => {
        const response = await boundLlm.invoke(
          state.messages.map((m) => {
            if (m.role === "tool") {
              return new ToolMessage({ content: m.content, tool_call_id: m.tool_call_id ?? "" });
            }
            if (m.role === "system") return new SystemMessage(m.content);
            return new HumanMessage(m.content);
          })
        );

        const aiMsg = response as AIMessage;
        const toolCalls = aiMsg.tool_calls ?? [];

        if (toolCalls.length === 0) {
          // No tool call — treat as a natural-language conclusion
          const text = typeof aiMsg.content === "string"
            ? aiMsg.content
            : JSON.stringify(aiMsg.content);
          return {
            messages: [{ role: "assistant", content: text }],
            result: text,
            done: true,
          };
        }

        // Persist the AI message with tool_calls for the next turn
        return {
          messages: [{ role: "assistant", content: JSON.stringify(toolCalls) }],
        };
      })

      // ── act: execute all requested tool calls ──
      .addNode("act", async (state: CodingState) => {
        const lastMsg = state.messages[state.messages.length - 1];
        let toolCalls: Array<{ name: string; args: Record<string, unknown>; id: string }> = [];
        try {
          toolCalls = JSON.parse(lastMsg.content);
        } catch {
          return { done: true, error: "Failed to parse tool calls from assistant message." };
        }

        const toolMessages: CodingState["messages"] = [];

        for (const call of toolCalls) {
          const mcpResult = await dispatchTool(call.name, call.args, state.workspaces);
          const text = mcpResult.content.map((c) => ("text" in c ? c.text : "")).join("\n");

          if (call.name === "finish" && !mcpResult.isError) {
            toolMessages.push({
              role: "tool",
              content: text,
              tool_call_id: call.id,
              name: call.name,
            });
            return { messages: toolMessages, result: text, done: true };
          }

          toolMessages.push({
            role: "tool",
            content: mcpResult.isError ? `[ERROR] ${text}` : text,
            tool_call_id: call.id,
            name: call.name,
          });
        }

        return { messages: toolMessages };
      })

      .addEdge("__start__", "think")
      .addConditionalEdges("think", (state: CodingState) => (state.done ? END : "act"))
      .addEdge("act", "think");

    return workflow.compile();
  }
}
