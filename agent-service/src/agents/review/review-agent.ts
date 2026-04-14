/**
 * ReviewAgent — performs LLM-powered code review on git diffs.
 *
 * Lifecycle:
 *  onInit    — build the LLM chat model from the profile config
 *  onExecute — collect git diff from workspaces, run LLM review, set _result
 *  onCleanup — no-op
 *
 * Events published via AgentEventBus:
 *  "review.started"           { agentId, executionId }
 *  "review.complete"          { agentId, executionId, approved, summary }
 *  "review.approved"          { agentId, executionId }
 *  "review.changes_requested" { agentId, executionId, commentCount }
 */
import { exec } from "child_process";
import { promisify } from "util";
import { BaseAgent } from "../../core/agent-framework/base-agent";
import type { AgentContext } from "../../core/agent-framework/context";
import { getAgentEventBus } from "../../core/agent-framework/event-bus";
import { buildChatModel } from "../../core/llm";
import { parseDiff, formatDiffForLLM } from "./diff-parser";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const execAsync = promisify(exec);

export interface ReviewAgentConfig {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl?: string;
}

export interface ReviewComment {
  file: string;
  line?: number;
  severity: "error" | "warning" | "suggestion" | "praise";
  message: string;
}

export interface ReviewResult {
  approved: boolean;
  summary: string;
  comments: ReviewComment[];
}

const REVIEW_SYSTEM_PROMPT = `You are an expert senior software engineer performing a thorough code review.

Your review must be:
- **Objective**: Focus on correctness, security, performance, and maintainability
- **Specific**: Reference exact file names and line numbers when possible
- **Actionable**: Every comment should explain what to change and why
- **Balanced**: Acknowledge good patterns as well as problems

Respond with a JSON object matching this schema:
{
  "approved": boolean,          // true only if the code is ready to merge as-is
  "summary": "string",          // 2-4 sentence overall assessment
  "comments": [
    {
      "file": "path/to/file",
      "line": 42,               // optional — omit if the comment applies to the whole file
      "severity": "error|warning|suggestion|praise",
      "message": "string"
    }
  ]
}

Respond with ONLY valid JSON. No markdown fences.`;

export class ReviewAgent extends BaseAgent {
  private llm!: BaseChatModel;

  constructor(
    id: string,
    private readonly config: ReviewAgentConfig,
  ) {
    super(id, "reviewer");
  }

  protected async onInit(_ctx: AgentContext): Promise<void> {
    this.llm = buildChatModel({
      provider: this.config.llmProvider,
      model: this.config.llmModel,
      apiKey: this.config.llmApiKey,
      baseUrl: this.config.llmBaseUrl,
    });
  }

  protected async onExecute(ctx: AgentContext): Promise<void> {
    const bus = getAgentEventBus();
    await bus.publish("review.started", { agentId: this.id, executionId: ctx.executionId });

    // Collect diffs from all workspaces
    const diffParts: string[] = [];
    const workspaces = ctx.workspaces ?? {};

    for (const [repoName, localPath] of Object.entries(workspaces)) {
      try {
        // Diff against the previous commit (or HEAD if nothing staged)
        const { stdout } = await execAsync("git diff HEAD~1 HEAD 2>/dev/null || git diff HEAD", {
          cwd: localPath,
          maxBuffer: 10 * 1024 * 1024, // 10 MB
        });
        if (stdout.trim()) {
          diffParts.push(`## Repository: ${repoName}\n${stdout}`);
        }
      } catch {
        // No commits yet or other git error — use working tree diff
        try {
          const { stdout } = await execAsync("git diff", { cwd: localPath });
          if (stdout.trim()) diffParts.push(`## Repository: ${repoName}\n${stdout}`);
        } catch {
          // Nothing to diff — skip
        }
      }
    }

    const rawDiff = diffParts.join("\n\n");

    if (!rawDiff.trim()) {
      this._result = {
        success: true,
        output: JSON.stringify({
          approved: true,
          summary: "No code changes detected. Nothing to review.",
          comments: [],
        } satisfies ReviewResult),
      };
      return;
    }

    const parsed = parseDiff(rawDiff);
    const diffForLLM = formatDiffForLLM(parsed);

    const taskDesc = ctx.task?.description ?? "Review the following code changes.";

    const response = await this.llm.invoke([
      new SystemMessage(REVIEW_SYSTEM_PROMPT),
      new HumanMessage(
        `Task context: ${taskDesc}\n\nCode changes to review:\n\n${diffForLLM}`
      ),
    ]);

    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    let review: ReviewResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      review = JSON.parse(jsonMatch?.[0] ?? content) as ReviewResult;
    } catch {
      review = {
        approved: false,
        summary: "Review parsing failed. Raw LLM output below.",
        comments: [{ file: "unknown", severity: "warning", message: content }],
      };
    }

    this._result = {
      success: true,
      output: JSON.stringify(review),
    };

    await bus.publish("review.complete", {
      agentId: this.id,
      executionId: ctx.executionId,
      approved: review.approved,
      summary: review.summary,
    });

    if (review.approved) {
      await bus.publish("review.approved", { agentId: this.id, executionId: ctx.executionId });
    } else {
      await bus.publish("review.changes_requested", {
        agentId: this.id,
        executionId: ctx.executionId,
        commentCount: review.comments.length,
      });
    }
  }

  protected async onCleanup(): Promise<void> {
    // Nothing to release
  }
}
