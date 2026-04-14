/**
 * KnowledgeAgent — answers questions about a codebase using LLM + code search.
 *
 * Phase 3 will add full vector-based RAG with document embeddings.
 * This Phase 2 implementation uses direct file search + LLM context window:
 *  - grep-like search for relevant code snippets
 *  - read matching files into context
 *  - send to LLM with the question
 *
 * Lifecycle:
 *  onInit    — build LLM model
 *  onExecute — search codebase for relevant context, ask LLM
 *  onCleanup — no-op
 *
 * Events published via AgentEventBus:
 *  "knowledge.query"    { agentId, executionId, query }
 *  "knowledge.answered" { agentId, executionId, confidence }
 */
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { BaseAgent } from "../../core/agent-framework/base-agent";
import type { AgentContext } from "../../core/agent-framework/context";
import { getAgentEventBus } from "../../core/agent-framework/event-bus";
import { buildChatModel } from "../../core/llm";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { embedTexts } from "../../services/embeddingService";
import { dataClient } from "../../services/dataClient";

const execAsync = promisify(exec);

export interface KnowledgeAgentConfig {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  /** Max number of files to include in context. Default: 10 */
  maxContextFiles?: number;
}

export interface KnowledgeAnswer {
  answer: string;
  /** 0-1 confidence estimate from the LLM */
  confidence: number;
  /** Source files that were used as context */
  sources: string[];
}

const KNOWLEDGE_SYSTEM_PROMPT = `You are an expert software engineer with deep knowledge of codebases.
You have been given snippets from relevant source files and project documents, and are asked a question.

Answer accurately and concisely. If you're unsure, say so explicitly.
Cite specific file paths and line numbers when referencing code, or document names when referencing project documents.

Respond with a JSON object:
{
  "answer": "detailed answer here",
  "confidence": 0.85,  // 0-1 estimate of how confident you are
  "sources": ["path/to/file1.ts", "Document: design-spec.pdf"]  // files and documents you referenced
}

Respond with ONLY valid JSON. No markdown fences.`;

export class KnowledgeAgent extends BaseAgent {
  private llm!: BaseChatModel;

  constructor(
    id: string,
    private readonly config: KnowledgeAgentConfig,
  ) {
    super(id, "knowledge");
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

    const query = ctx.task?.description ?? ctx.task?.title ?? "Describe the codebase";
    await bus.publish("knowledge.query", { agentId: this.id, executionId: ctx.executionId, query });

    const maxFiles = this.config.maxContextFiles ?? 10;
    const workspaces = ctx.workspaces ?? {};

    // Collect relevant files across all workspaces
    const contextFiles: Array<{ repoName: string; filePath: string; content: string }> = [];

    for (const [repoName, localPath] of Object.entries(workspaces)) {
      const relevant = await this.findRelevantFiles(localPath, query, maxFiles);
      for (const [filePath, content] of relevant) {
        contextFiles.push({ repoName, filePath, content });
        if (contextFiles.length >= maxFiles) break;
      }
      if (contextFiles.length >= maxFiles) break;
    }

    // Build code context block
    const codeContextBlock = contextFiles.length > 0
      ? contextFiles.map((f) =>
          `### ${f.repoName}/${f.filePath}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``
        ).join("\n\n")
      : "";

    // RAG: retrieve relevant document chunks if project has documents
    let docContextBlock = "";
    try {
      const queryEmbeddings = await embedTexts([query]);
      const queryEmbedding = queryEmbeddings[0];
      if (queryEmbedding) {
        const chunks = await dataClient.searchDocumentChunks(ctx.project.id, queryEmbedding, 5);
        if (chunks.length > 0) {
          docContextBlock = chunks
            .map((c) => `### Document: ${c.document_name} (chunk ${c.chunk_index})\n${c.content}`)
            .join("\n\n");
        }
      }
    } catch {
      // RAG is best-effort — don't fail the whole agent if embeddings/search fail
    }

    const contextBlock = [
      docContextBlock ? `## Project Documents\n\n${docContextBlock}` : "",
      codeContextBlock ? `## Source Files\n\n${codeContextBlock}` : "",
    ]
      .filter(Boolean)
      .join("\n\n") || "No relevant context found.";

    const response = await this.llm.invoke([
      new SystemMessage(KNOWLEDGE_SYSTEM_PROMPT),
      new HumanMessage(`Question: ${query}\n\nRelevant context:\n\n${contextBlock}`),
    ]);

    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    let answer: KnowledgeAnswer;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      answer = JSON.parse(jsonMatch?.[0] ?? content) as KnowledgeAnswer;
    } catch {
      answer = {
        answer: content,
        confidence: 0.5,
        sources: contextFiles.map((f) => `${f.repoName}/${f.filePath}`),
      };
    }

    this._result = { success: true, output: JSON.stringify(answer) };

    await bus.publish("knowledge.answered", {
      agentId: this.id,
      executionId: ctx.executionId,
      confidence: answer.confidence,
    });
  }

  protected async onCleanup(): Promise<void> {
    // Nothing to release
  }

  /**
   * Find files most relevant to the query.
   * Strategy: ripgrep-style keyword search, fall back to directory listing.
   */
  private async findRelevantFiles(
    workspacePath: string,
    query: string,
    maxFiles: number,
  ): Promise<[string, string][]> {
    // Extract significant keywords from the query (skip common stop words)
    const STOP_WORDS = new Set(["the", "a", "an", "in", "on", "at", "of", "for",
      "to", "is", "are", "was", "were", "how", "what", "where", "when", "why",
      "does", "do", "can", "could", "would", "should", "which", "that", "this"]);

    const keywords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .slice(0, 5);

    const matchingPaths = new Set<string>();

    if (keywords.length > 0) {
      // Try grep for each keyword (best-effort)
      for (const keyword of keywords) {
        try {
          const { stdout } = await execAsync(
            `grep -rl "${keyword}" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.rs" -l 2>/dev/null | head -${maxFiles}`,
            { cwd: workspacePath }
          );
          for (const p of stdout.trim().split("\n").filter(Boolean)) {
            matchingPaths.add(p.replace(/^\.\//, ""));
            if (matchingPaths.size >= maxFiles) break;
          }
        } catch {
          // grep not available or no matches
        }
        if (matchingPaths.size >= maxFiles) break;
      }
    }

    // If we didn't find enough files via grep, supplement with directory scan
    if (matchingPaths.size < maxFiles) {
      const walked = await this.walkDirectory(workspacePath, maxFiles - matchingPaths.size);
      for (const p of walked) matchingPaths.add(p);
    }

    // Read file contents
    const results: [string, string][] = [];
    for (const relPath of matchingPaths) {
      if (results.length >= maxFiles) break;
      try {
        const content = await fs.readFile(path.join(workspacePath, relPath), "utf-8");
        results.push([relPath, content]);
      } catch {
        // skip unreadable
      }
    }

    return results;
  }

  private async walkDirectory(dir: string, limit: number): Promise<string[]> {
    const IGNORE = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__"]);
    const SRC_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb"]);
    const results: string[] = [];

    async function walk(current: string): Promise<void> {
      if (results.length >= limit) return;
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => null);
      if (!entries) return;

      for (const entry of entries) {
        if (results.length >= limit) return;
        const fullPath = path.join(current, String(entry.name));
        if (entry.isDirectory()) {
          if (!IGNORE.has(String(entry.name))) await walk(fullPath);
        } else if (SRC_EXTS.has(path.extname(String(entry.name)))) {
          results.push(path.relative(dir, fullPath));
        }
      }
    }

    await walk(dir);
    return results;
  }
}
