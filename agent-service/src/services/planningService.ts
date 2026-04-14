import * as fs from "fs";
import * as fsPath from "path";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import { buildChatModel } from "../core/llm";
import { dataClient } from "./dataClient";
import { sseManager } from "./sseManager";
import { startExecution } from "./executionService";
import { ensureLocalPath, listDirectory, readFile, searchCode } from "./repoExplorer";
// ─── Planning types (formerly in agents/planning/state.ts) ───────────────────

interface PlanDraft {
  tasks: PlannedTask[];
}

interface PlannedTask {
  title: string;
  description: string;
  type: "code" | "test" | "review" | "general";
  execution_order: number;
  depends_on_task_indices: number[];
  recommended_agent_profile_id: string | null;
  repository_ids: string[];
}

interface AgentProfileSummary {
  id: string;
  name: string;
  description: string;
  agent_type: string;
  skills: Array<{ name: string; description: string }>;
}

interface RepositorySummary {
  id: string;
  name: string;
  remote_url: string;
}

// ─── Session state ────────────────────────────────────────────────────────────

type Phase = "interview" | "review";

interface ProjectContext {
  name: string;
  description: string | null;
  existingPlans: Array<{ title: string | null; status: string }>;
  repoStructures: Array<{ name: string; structure: string }>;
}

interface Session {
  planId: string;
  projectId: string;
  planTitle: string | null;
  phase: Phase;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  planDraft: PlanDraft | null;
  agentProfiles: AgentProfileSummary[];
  projectRepositories: RepositorySummary[];
  projectContext: ProjectContext | null;
  repoTools: DynamicStructuredTool[];
}

interface SavedTask {
  id: string;
  plan_id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  execution_order: number;
  agent_profile_id: string | null;
  depends_on_task_ids: string[];
  repository_ids: string[];
}

// ─── Streaming helpers ────────────────────────────────────────────────────────

async function streamMessageChunks(planId: string, text: string): Promise<void> {
  const chunks = text.match(/\S+\s*/g) ?? [text];
  for (const chunk of chunks) {
    sseManager.broadcast(planId, { type: "chat_token", content: chunk });
    await new Promise((r) => setTimeout(r, 18));
  }
}

// Converts a DB-saved task back to a PlannedTask (for session.planDraft reconstruction)
function savedTaskToPlanned(task: SavedTask, allTasks: SavedTask[]): PlannedTask {
  const idToIndex = new Map(allTasks.map((t, i) => [t.id, i]));
  return {
    title: task.title,
    description: task.description,
    type: task.type as PlannedTask["type"],
    execution_order: task.execution_order,
    depends_on_task_indices: task.depends_on_task_ids
      .map((id) => idToIndex.get(id) ?? -1)
      .filter((i) => i >= 0),
    recommended_agent_profile_id: task.agent_profile_id,
    repository_ids: task.repository_ids,
  };
}

/**
 * Persists draft tasks to the DB (replacing any existing ones) so they survive
 * page reloads and agent-service restarts. Returns the saved tasks with real UUIDs.
 *
 * Two-pass strategy:
 *   Pass 1 — create all tasks without dependencies to obtain their real UUIDs.
 *   Pass 2 — patch tasks that have dependencies, resolving index references to UUIDs.
 */
async function saveDraftTasks(
  planId: string,
  plannedTasks: PlannedTask[]
): Promise<SavedTask[]> {
  await dataClient.deleteTasksByPlan(planId);

  // Pass 1: create tasks (no deps yet)
  const saved = await Promise.all(
    plannedTasks.map((t, i) =>
      dataClient.createTask({
        plan_id: planId,
        title: t.title,
        description: t.description ?? "",
        type: t.type ?? "general",
        status: "pending",
        execution_order: t.execution_order ?? i,
        ...(t.recommended_agent_profile_id ? { agent_profile_id: t.recommended_agent_profile_id } : {}),
        repository_ids: t.repository_ids ?? [],
      })
    )
  );

  // Pass 2: patch dependency links using resolved UUIDs
  const idByIndex = saved.map((t) => t.id);
  await Promise.all(
    plannedTasks.map(async (t, i) => {
      const deps = (t.depends_on_task_indices ?? [])
        .map((idx) => idByIndex[idx])
        .filter((id): id is string => Boolean(id));
      if (deps.length === 0) return;
      await dataClient.updateTask(saved[i].id, { depends_on_task_ids: deps });
    })
  );

  return (await dataClient.getPlanTasks(planId)) as SavedTask[];
}

function buildPlanDraftPayload(planId: string, session: Session, savedTasks: SavedTask[]) {
  return {
    id: planId,
    project_id: session.projectId,
    title: session.planTitle,
    status: "draft" as const,
    created_at: new Date().toISOString(),
    tasks: savedTasks,
  };
}

// ─── Structured LLM response ──────────────────────────────────────────────────

interface PlannerLlmResponse {
  message: string;
  ready_for_plan: boolean;
  plan: { tasks: PlannedTask[] } | null;
}

function parsePlannerResponse(text: string): PlannerLlmResponse | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.message !== "string") return null;
    return {
      message: parsed.message,
      ready_for_plan: Boolean(parsed.ready_for_plan),
      plan: parsed.plan ?? null,
    };
  } catch {
    return null;
  }
}

const sessions = new Map<string, Session>();

// ─── Repo tools for the planner ──────────────────────────────────────────────

interface RepoToolRef {
  id: string;
  name: string;
  remote_url?: string;
  branch?: string;
  auth_type?: string;
  credentials?: string;
  local_path?: string;
}

/**
 * Builds LangChain tools that let the planner LLM explore connected repos.
 * Each tool call first ensures the repo is available locally (lazy shallow clone).
 */
function buildRepoTools(repos: RepoToolRef[], projectId: string): DynamicStructuredTool[] {
  if (repos.length === 0) return [];

  const localPathCache = new Map<string, string>();

  async function getPath(repoName: string): Promise<string | null> {
    if (localPathCache.has(repoName)) return localPathCache.get(repoName)!;
    const repo = repos.find((r) => r.name === repoName);
    if (!repo) return null;
    try {
      const p = await ensureLocalPath(repo, projectId);
      localPathCache.set(repoName, p);
      return p;
    } catch {
      return null;
    }
  }

  const repoNames = repos.map((r) => r.name).join(", ");

  const listDirTool = new DynamicStructuredTool({
    name: "list_directory",
    description:
      `List files and subdirectories at a path inside a project repository. ` +
      `Available repos: ${repoNames}. ` +
      `Use this to explore the project structure. Start with an empty path to see the root.`,
    schema: z.object({
      repo: z.string().describe(`Repository name (one of: ${repoNames})`),
      path: z.string().default("").describe("Relative path inside the repo (empty = root)"),
    }),
    func: async ({ repo, path }) => {
      const local = await getPath(repo);
      if (!local) return `Repository "${repo}" could not be accessed. Available: ${repoNames}`;
      return listDirectory(local, path);
    },
  });

  const readFileTool = new DynamicStructuredTool({
    name: "read_file",
    description:
      `Read the contents of a file inside a project repository. ` +
      `Available repos: ${repoNames}. ` +
      `Use this to read package.json, config files, entry points, schemas, etc.`,
    schema: z.object({
      repo: z.string().describe(`Repository name (one of: ${repoNames})`),
      path: z.string().describe("Relative file path (e.g. 'package.json', 'src/index.ts')"),
    }),
    func: async ({ repo, path }) => {
      const local = await getPath(repo);
      if (!local) return `Repository "${repo}" could not be accessed. Available: ${repoNames}`;
      return readFile(local, path);
    },
  });

  const searchCodeTool = new DynamicStructuredTool({
    name: "search_code",
    description:
      `Search for a text pattern across repository files (like grep -r). ` +
      `Available repos: ${repoNames}. ` +
      `Use this to find implementations, locate configs, or discover patterns.`,
    schema: z.object({
      repo: z.string().describe(`Repository name (one of: ${repoNames})`),
      pattern: z.string().describe("Text pattern to search for"),
      file_glob: z.string().default("*").describe("File glob filter (e.g. '*.ts', '*.json')"),
    }),
    func: async ({ repo, pattern, file_glob }) => {
      const local = await getPath(repo);
      if (!local) return `Repository "${repo}" could not be accessed. Available: ${repoNames}`;
      return searchCode(local, pattern, file_glob);
    },
  });

  return [listDirTool, readFileTool, searchCodeTool];
}

/**
 * Runs a LangChain tool-use agentic loop.
 * Continues invoking the LLM until it produces a response with no tool calls.
 * Broadcasts `chat_tool_use` SSE events so the user sees what's being explored.
 */
async function runToolLoop(
  llm: Awaited<ReturnType<typeof buildChatModel>>,
  tools: DynamicStructuredTool[],
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  planId: string
): Promise<string> {
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  // Convert plain message objects to LangChain message instances
  const lcMessages = messages.map((m) => {
    if (m.role === "system") return new SystemMessage(m.content);
    if (m.role === "user") return new HumanMessage(m.content);
    return new AIMessage(m.content);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const llmWithTools = tools.length > 0 ? (llm as any).bindTools(tools) : llm;

  const MAX_ROUNDS = 12;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await llmWithTools.invoke(lcMessages);

    const toolCalls = (response as AIMessage).tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Final response — no more tools
      return typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    }

    // Add AI message with tool calls
    lcMessages.push(response as AIMessage);

    // Execute tools and collect results
    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => {
        const tool = toolMap.get(tc.name);

        // Notify frontend about the tool invocation
        sseManager.broadcast(planId, {
          type: "chat_tool_use",
          tool: tc.name,
          input: tc.args,
        });

        let result: string;
        if (!tool) {
          result = `Unknown tool: ${tc.name}`;
        } else {
          try {
            result = String(await tool.invoke(tc.args));
          } catch (e) {
            result = `Tool error: ${e}`;
          }
        }

        return new ToolMessage({ content: result, tool_call_id: tc.id! });
      })
    );

    lcMessages.push(...toolResults);
  }

  // Fallback: invoke without tools after hitting max rounds
  const finalResponse = await llm.invoke(lcMessages);
  return typeof finalResponse.content === "string"
    ? finalResponse.content
    : JSON.stringify(finalResponse.content);
}


// ─── Project context gathering ────────────────────────────────────────────────

/**
 * Walks a directory tree up to `maxDepth` levels, returning a compact
 * indented listing (similar to `tree`). Skips common noise directories.
 */
function scanRepoStructure(rootPath: string, maxDepth = 3): string {
  const IGNORE = new Set([
    ".git", "node_modules", "__pycache__", ".next", "dist", "build",
    ".venv", "venv", ".mypy_cache", ".pytest_cache", "coverage",
    ".turbo", ".cache", "vendor",
  ]);

  const lines: string[] = [];

  function walk(dir: string, depth: number, prefix: string) {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const filtered = entries.filter((e) => !IGNORE.has(e.name) && !e.name.startsWith("."));
    filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    filtered.slice(0, 60).forEach((entry, i) => {
      const isLast = i === Math.min(filtered.length, 60) - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? prefix + "    " : prefix + "│   ";
      lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}`);
      if (entry.isDirectory()) walk(fsPath.join(dir, entry.name), depth + 1, childPrefix);
    });
    if (filtered.length > 60) lines.push(`${prefix}... (${filtered.length - 60} more)`);
  }

  lines.push(fsPath.basename(rootPath) + "/");
  walk(rootPath, 1, "");
  return lines.join("\n");
}

async function gatherProjectContext(projectId: string, currentPlanId: string): Promise<ProjectContext> {
  const [project, allPlans, repos] = await Promise.all([
    dataClient.getProject(projectId),
    dataClient.getProjectPlans(projectId),
    dataClient.getProjectRepositories(projectId),
  ]);

  const existingPlans = allPlans
    .filter((p) => p.id !== currentPlanId)
    .map((p) => ({ title: p.title, status: p.status }));

  const repoStructures = (repos as Array<{ id: string; name: string; local_path?: string; remote_url?: string }>)
    .map((r) => {
      let structure = "(not yet cloned)";
      if (r.local_path) {
        try {
          structure = scanRepoStructure(r.local_path);
        } catch {
          structure = "(unable to scan)";
        }
      }
      return { name: r.name, structure };
    });

  return {
    name: project.name,
    description: project.description,
    existingPlans,
    repoStructures,
  };
}

function buildProjectContextText(ctx: ProjectContext, planTitle: string | null): string {
  const lines: string[] = [];

  lines.push(`Project: ${ctx.name}`);
  if (ctx.description) lines.push(`Description: ${ctx.description}`);

  if (ctx.existingPlans.length > 0) {
    lines.push("\nExisting plans for this project (do NOT duplicate their scope):");
    ctx.existingPlans.forEach((p) => {
      lines.push(`  - "${p.title ?? "(untitled)"}" [${p.status}]`);
    });
  }

  if (planTitle) lines.push(`\nThis plan is titled: "${planTitle}"`);

  if (ctx.repoStructures.length > 0) {
    lines.push("\nRepository file structure(s):");
    ctx.repoStructures.forEach((r) => {
      lines.push(`\n### ${r.name}\n\`\`\`\n${r.structure}\n\`\`\``);
    });
  }

  return lines.join("\n");
}


const BASE_SYSTEM =
  "You are an expert software project planning assistant. " +
  "Your job is to interview the user to understand what they want to build, " +
  "then produce a detailed, dependency-ordered execution plan.";

const TASK_SCHEMA =
  '{"title":"string","description":"string","type":"code|test|review|general",' +
  '"execution_order":0,"depends_on_task_indices":[],' +
  '"recommended_agent_profile_id":"uuid_or_null","repository_ids":["repo_uuid"]}';

const STRUCTURED_OUTPUT_INSTRUCTIONS =
  "\n\nCRITICAL: Always respond with ONLY valid JSON — no markdown, no extra text:\n" +
  '{"message":"<natural language reply>","ready_for_plan":false,"plan":null}\n\n' +
  "When you have gathered enough information to build a complete plan, set ready_for_plan to true " +
  "and include the full plan in the same response:\n" +
  `{"message":"<brief plan summary for the user>","ready_for_plan":true,"plan":{"tasks":[${TASK_SCHEMA}]}}\n\n` +
  "Plan rules:\n" +
  "- depends_on_task_indices are 0-based indices into the tasks array\n" +
  "- Assign the best-matching agent profile id for each task (or null)\n" +
  "- execution_order starts at 0 and increases";

function buildGreeting(title: string | null): string {
  if (title) {
    return (
      `Hello! I'm your AI planning assistant. I'll help you build a detailed execution plan for **${title}**.\n\n` +
      "Describe what you want to achieve, any constraints, and technical requirements."
    );
  }
  return (
    "Hello! I'm your AI planning assistant. I'll help you break down " +
    "this feature into an actionable execution plan.\n\n" +
    "Tell me: **what are you building?** You can describe it at any level of detail — we'll refine together."
  );
}

// ─── Session init (called on SSE connect) ─────────────────────────────────────

export async function initSession(planId: string): Promise<void> {
  if (sessions.has(planId)) return;

  const plan = await dataClient.getPlan(planId);
  const [profiles, repos, existingMessages, existingTasks, projectContext] = await Promise.all([
    dataClient.getAgentProfiles(),
    dataClient.getProjectRepositories(plan.project_id),
    dataClient.getPlanMessages(planId),
    dataClient.getPlanTasks(planId) as Promise<SavedTask[]>,
    gatherProjectContext(plan.project_id, planId),
  ]);

  const isFirstVisit = (existingMessages as unknown[]).length === 0;
  const isInReview = plan.status === "draft" && (existingTasks as SavedTask[]).length > 0;

  // Restore conversation history from DB for LLM context
  const history: Array<{ role: "user" | "assistant"; content: string }> =
    (existingMessages as Array<{ role: string; content: string }>)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const tasks = existingTasks as SavedTask[];

  sessions.set(planId, {
    planId,
    projectId: plan.project_id,
    planTitle: plan.title,
    phase: isInReview ? "review" : "interview",
    messages: history.length > 0 ? history : [{ role: "assistant", content: buildGreeting(plan.title) }],
    planDraft: isInReview ? { tasks: tasks.map((t) => savedTaskToPlanned(t, tasks)) } : null,
    agentProfiles: profiles,
    projectRepositories: repos,
    projectContext,
    repoTools: buildRepoTools(repos as RepoToolRef[], plan.project_id),
  });

  if (isFirstVisit) {
    // Only stream greeting when opening a plan for the very first time
    await new Promise((r) => setTimeout(r, 150));
    const greeting = buildGreeting(plan.title);
    sseManager.broadcast(planId, { type: "chat_token", content: greeting });
    dataClient
      .saveMessage({ project_id: plan.project_id, plan_id: planId, role: "assistant", content: greeting })
      .catch(console.error);
    sseManager.broadcast(planId, { type: "chat_end" });
  }
  // Returning users: no greeting broadcast — the frontend loads history from DB on page load
}

// ─── User message handler (called on POST /message) ───────────────────────────

export async function handleUserMessage(planId: string, content: string): Promise<void> {
  let session = sessions.get(planId);

  if (!session) {
    const plan = await dataClient.getPlan(planId);
    const [profiles, repos, existingMessages, existingTasks, projectContext] = await Promise.all([
      dataClient.getAgentProfiles(),
      dataClient.getProjectRepositories(plan.project_id),
      dataClient.getPlanMessages(planId),
      dataClient.getPlanTasks(planId) as Promise<SavedTask[]>,
      gatherProjectContext(plan.project_id, planId),
    ]);

    const isInReview = plan.status === "draft" && (existingTasks as SavedTask[]).length > 0;
    const history: Array<{ role: "user" | "assistant"; content: string }> =
      (existingMessages as Array<{ role: string; content: string }>)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const tasks = existingTasks as SavedTask[];

    session = {
      planId,
      projectId: plan.project_id,
      planTitle: plan.title,
      phase: isInReview ? "review" : "interview",
      messages: history.length > 0 ? history : [{ role: "assistant", content: buildGreeting(plan.title) }],
      planDraft: isInReview ? { tasks: tasks.map((t) => savedTaskToPlanned(t, tasks)) } : null,
      agentProfiles: profiles,
      projectRepositories: repos,
      projectContext,
      repoTools: buildRepoTools(repos as RepoToolRef[], plan.project_id),
    };
    sessions.set(planId, session);
  }

  const trimmed = content.trim();
  session.messages.push({ role: "user", content: trimmed });
  await dataClient.saveMessage({ project_id: session.projectId, plan_id: planId, role: "user", content: trimmed });

  sseManager.broadcast(planId, { type: "chat_thinking" });

  const settings = await dataClient.getSettings();
  const llm = buildChatModel({
    provider: settings.llm_provider,
    model: settings.llm_model,
    apiKey: settings.llm_api_key_raw ?? "",
    baseUrl: settings.llm_base_url,
  });

  if (session.phase === "interview") {
    await runInterview(session, llm, planId);
  } else {
    await runReview(session, llm, trimmed, planId);
  }
}

// ─── Interview phase ──────────────────────────────────────────────────────────

async function runInterview(session: Session, llm: Awaited<ReturnType<typeof buildChatModel>>, planId: string) {
  const profilesText = session.agentProfiles.length
    ? session.agentProfiles
        .map((p) => `- id:${p.id} name:${p.name} type:${p.agent_type} skills:[${p.skills.map((s) => s.name).join(",")}]`)
        .join("\n")
    : "None configured yet.";

  const reposText = session.projectRepositories.length
    ? session.projectRepositories.map((r) => `- id:${r.id} name:${r.name} url:${r.remote_url ?? "(local)"}`).join("\n")
    : "None configured yet.";

  const contextBlock = session.projectContext
    ? `\n\n## Project Context\n${buildProjectContextText(session.projectContext, session.planTitle)}`
    : "";

  const hasTools = session.repoTools.length > 0;
  const toolsNote = hasTools
    ? "\n\nYou have tools to explore the repository filesystem (list_directory, read_file, search_code). " +
      "Use them proactively to understand the codebase structure, dependencies, and conventions BEFORE asking the user questions. " +
      "Only ask the user what you cannot discover from the code."
    : "";

  const systemContent =
    BASE_SYSTEM + contextBlock +
    `\n\nAvailable agent profiles:\n${profilesText}` +
    `\n\nProject repositories (use these IDs in task repository_ids):\n${reposText}` +
    toolsNote +
    "\n\nUse the project context above to ask targeted follow-up questions and avoid duplicating existing work. " +
    "Ask ONE focused follow-up question at a time. " +
    "Set ready_for_plan to true only when you have enough information for a complete plan." +
    STRUCTURED_OUTPUT_INSTRUCTIONS;

  const llmMessages = buildMessageList(session.messages, systemContent);
  const text = await runToolLoop(llm, session.repoTools, llmMessages, planId);

  const parsed = parsePlannerResponse(text);

  if (!parsed) {
    session.messages.push({ role: "assistant", content: text });
    await streamMessageChunks(planId, text);
    await dataClient.saveMessage({ project_id: session.projectId, plan_id: planId, role: "assistant", content: text });
    sseManager.broadcast(planId, { type: "chat_end" });
    return;
  }

  session.messages.push({ role: "assistant", content: parsed.message });
  await streamMessageChunks(planId, parsed.message);
  await dataClient.saveMessage({ project_id: session.projectId, plan_id: planId, role: "assistant", content: parsed.message });

  if (parsed.ready_for_plan && parsed.plan) {
    const savedTasks = await saveDraftTasks(planId, parsed.plan.tasks);
    session.planDraft = { tasks: savedTasks.map((t) => savedTaskToPlanned(t, savedTasks)) };
    session.phase = "review";
    sseManager.broadcast(planId, { type: "plan_draft", plan: buildPlanDraftPayload(planId, session, savedTasks) });
  }

  sseManager.broadcast(planId, { type: "chat_end" });
}

// ─── Confirm / refine ─────────────────────────────────────────────────────────

async function runReview(session: Session, llm: Awaited<ReturnType<typeof buildChatModel>>, userContent: string, planId: string) {
  const lower = userContent.toLowerCase();
  const isConfirm =
    lower === "confirm" || lower === "yes" || lower.startsWith("confirm") ||
    lower.includes("looks good") || lower.includes("start execution") || lower.includes("approve");

  if (isConfirm) await confirmPlan(session, planId);
  else await refinePlan(session, llm, planId);
}

async function confirmPlan(session: Session, planId: string) {
  const plan = await dataClient.updatePlan(planId, {
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  });

  // Tasks are already in DB (saved on draft). Promote those with no deps to "ready".
  const tasks = (await dataClient.getPlanTasks(planId)) as SavedTask[];
  await Promise.all(
    tasks
      .filter((t) => t.depends_on_task_ids.length === 0)
      .map((t) => dataClient.updateTask(t.id, { status: "ready" }))
  );

  const confirmMsg = "✅ Plan confirmed and saved! Execution will begin shortly.";
  session.messages.push({ role: "assistant", content: confirmMsg });
  await streamMessageChunks(planId, confirmMsg);
  await dataClient.saveMessage({ project_id: session.projectId, plan_id: planId, role: "assistant", content: confirmMsg });
  sseManager.broadcast(planId, { type: "plan_confirmed", plan_id: plan.id });

  sessions.delete(planId);
  void startExecution(session.projectId, plan.id);
}

async function refinePlan(session: Session, llm: Awaited<ReturnType<typeof buildChatModel>>, planId: string) {
  const profilesText = session.agentProfiles
    .map((p) => `- id:${p.id} name:${p.name} type:${p.agent_type}`)
    .join("\n") || "none";
  const reposText = session.projectRepositories
    .map((r) => `- id:${r.id} name:${r.name}`)
    .join("\n") || "none";

  const contextBlock = session.projectContext
    ? `\n\n## Project Context\n${buildProjectContextText(session.projectContext, session.planTitle)}`
    : "";

  const systemContent =
    BASE_SYSTEM + contextBlock +
    "\n\nThe user wants to revise the current plan." +
    `\n\nCurrent plan:\n${JSON.stringify(session.planDraft, null, 2)}` +
    `\n\nAvailable agent profiles:\n${profilesText}` +
    `\n\nAvailable repositories (use these IDs in task repository_ids):\n${reposText}` +
    "\n\nApply the user's requested changes and return the updated plan. Always set ready_for_plan to true." +
    STRUCTURED_OUTPUT_INSTRUCTIONS;

  const llmMessages = buildMessageList(session.messages, systemContent);
  const response = await llm.invoke(llmMessages);
  const text = extractText(response).trim();

  const parsed = parsePlannerResponse(text);

  if (!parsed || !parsed.plan) {
    const errMsg = "Sorry, I couldn't parse the updated plan. Please try describing your changes again.";
    sseManager.broadcast(planId, { type: "chat_token", content: errMsg });
    sseManager.broadcast(planId, { type: "chat_end" });
    return;
  }

  // Persist revised tasks to DB (replaces old draft tasks)
  const savedTasks = await saveDraftTasks(planId, parsed.plan.tasks);
  session.planDraft = { tasks: savedTasks.map((t) => savedTaskToPlanned(t, savedTasks)) };
  session.messages.push({ role: "assistant", content: parsed.message });
  await streamMessageChunks(planId, parsed.message);
  await dataClient.saveMessage({ project_id: session.projectId, plan_id: planId, role: "assistant", content: parsed.message });
  sseManager.broadcast(planId, { type: "plan_draft", plan: buildPlanDraftPayload(planId, session, savedTasks) });
  sseManager.broadcast(planId, { type: "chat_end" });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMessageList(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemContent: string
) {
  const base: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemContent },
  ];
  if (history.length === 0) return base;
  const msgs = history[0].role === "assistant"
    ? [{ role: "user" as const, content: "(conversation started)" }, ...history]
    : [...history];
  return [...base, ...msgs];
}

function extractText(response: { content: unknown }): string {
  if (typeof response.content === "string") return response.content;
  return JSON.stringify(response.content);
}
