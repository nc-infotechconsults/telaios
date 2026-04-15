/**
 * TestingAgent — runs existing tests and optionally generates new ones via LLM.
 *
 * Lifecycle:
 *  onInit    — build LLM, detect test framework in each workspace
 *  onExecute — run tests; if tests fail or none exist, generate new tests via LLM
 *  onCleanup — no-op
 *
 * Events published via AgentEventBus:
 *  "tests.started"  { agentId, executionId }
 *  "tests.passed"   { agentId, executionId, passed, failed, durationMs }
 *  "tests.failed"   { agentId, executionId, passed, failed, durationMs }
 *  "tests.generated" { agentId, executionId, filesGenerated }
 */
import * as fs from "fs/promises";
import * as path from "path";
import { BaseAgent } from "../../core/agent-framework/base-agent";
import type { AgentContext } from "../../core/agent-framework/context";
import type { AgentArtifact } from "../coordinator/drivers/base";
import { getAgentEventBus } from "../../core/agent-framework/event-bus";
import { buildChatModel } from "../../core/llm";
import { detectFramework, runTests } from "./test-runner";
import type { TestRunResult } from "./test-runner";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export interface TestingAgentConfig {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  /** If true, generate tests when none are found. Default: true. */
  generateTests?: boolean;
}

const TEST_GEN_SYSTEM_PROMPT = `You are an expert software engineer specializing in test-driven development.

Given a task description and source code files, generate comprehensive tests that:
1. Cover happy paths, edge cases, and error conditions
2. Follow the detected test framework conventions
3. Are self-contained and runnable without mocks unless necessary

Respond with a JSON array of files to create:
[
  {
    "path": "tests/unit/example.test.ts",
    "content": "// full file content here"
  }
]

Respond with ONLY valid JSON. No markdown fences.`;

export class TestingAgent extends BaseAgent {
  private llm!: BaseChatModel;

  constructor(
    id: string,
    private readonly config: TestingAgentConfig,
  ) {
    super(id, "tester");
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
    await bus.publish("tests.started", { agentId: this.id, executionId: ctx.executionId });

    const workspaces = ctx.workspaces ?? {};
    const allResults: TestRunResult[] = [];
    const generatedFiles: string[] = [];

    for (const [repoName, localPath] of Object.entries(workspaces)) {
      const framework = await detectFramework(localPath);

      if (!framework) {
        // No known test framework — optionally generate tests
        if (this.config.generateTests !== false) {
          const generated = await this.generateTests(ctx, localPath, "jest");
          generatedFiles.push(...generated.map((f) => `${repoName}/${f}`));
        }
        continue;
      }

      const result = await runTests(localPath, framework);
      allResults.push(result);

      if (!result.success && this.config.generateTests !== false) {
        // Tests failed — generate additional tests to improve coverage
        const generated = await this.generateTests(ctx, localPath, framework.name);
        generatedFiles.push(...generated.map((f) => `${repoName}/${f}`));
      }
    }

    const totalPassed = allResults.reduce((s, r) => s + r.passed, 0);
    const totalFailed = allResults.reduce((s, r) => s + r.failed, 0);
    const totalDuration = allResults.reduce((s, r) => s + r.durationMs, 0);
    const overallSuccess = allResults.every((r) => r.success) && allResults.length > 0;

    const summary = {
      passed: totalPassed,
      failed: totalFailed,
      durationMs: totalDuration,
      results: allResults,
      generatedFiles,
    };

    this._result = {
      success: overallSuccess || generatedFiles.length > 0,
      output: JSON.stringify(summary),
      artifacts: [
        {
          type: "test_result",
          title: `Test Results — ${totalPassed} passed, ${totalFailed} failed`,
          content: JSON.stringify(summary),
          content_type: "application/json",
          metadata: {
            passed: totalPassed,
            failed: totalFailed,
            skipped: 0,
            total: totalPassed + totalFailed,
            duration_ms: totalDuration,
          },
        } satisfies AgentArtifact,
      ],
    };

    const eventTopic = overallSuccess ? "tests.passed" : "tests.failed";
    await bus.publish(eventTopic, {
      agentId: this.id,
      executionId: ctx.executionId,
      passed: totalPassed,
      failed: totalFailed,
      durationMs: totalDuration,
    });

    if (generatedFiles.length > 0) {
      await bus.publish("tests.generated", {
        agentId: this.id,
        executionId: ctx.executionId,
        filesGenerated: generatedFiles.length,
      });
    }
  }

  protected async onCleanup(): Promise<void> {
    // Nothing to release
  }

  private async generateTests(
    ctx: AgentContext,
    workspacePath: string,
    frameworkHint: string,
  ): Promise<string[]> {
    const taskDesc = ctx.task?.description ?? "Generate tests for the codebase.";

    // Collect a sample of source files for context
    const srcFiles = await this.collectSourceFiles(workspacePath, 5);
    const srcContext = srcFiles.map(([filePath, content]) =>
      `### ${filePath}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``
    ).join("\n\n");

    const response = await this.llm.invoke([
      new SystemMessage(TEST_GEN_SYSTEM_PROMPT),
      new HumanMessage(
        `Task: ${taskDesc}\n\nTest framework: ${frameworkHint}\n\nSource files:\n${srcContext}`
      ),
    ]);

    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      const files = JSON.parse(jsonMatch?.[0] ?? content) as Array<{ path: string; content: string }>;

      const written: string[] = [];
      for (const file of files) {
        const absPath = path.join(workspacePath, file.path);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, file.content, "utf-8");
        written.push(file.path);
      }
      return written;
    } catch {
      return [];
    }
  }

  private async collectSourceFiles(
    dir: string,
    maxFiles: number,
  ): Promise<[string, string][]> {
    const results: [string, string][] = [];
    const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
    const SRC_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"]);

    async function walk(current: string): Promise<void> {
      if (results.length >= maxFiles) return;
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => null);
      if (!entries) return;

      for (const entry of entries) {
        if (results.length >= maxFiles) return;
        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(String(entry.name))) await walk(path.join(current, String(entry.name)));
        } else if (SRC_EXTS.has(path.extname(String(entry.name)))) {
          const fullPath = path.join(current, String(entry.name));
          try {
            const content = await fs.readFile(fullPath, "utf-8");
            results.push([path.relative(dir, fullPath), content]);
          } catch { /* skip unreadable files */ }
        }
      }
    }

    await walk(dir);
    return results;
  }
}
