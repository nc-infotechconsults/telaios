import { buildChatModel } from "../core/llm";
import { dataClient } from "./dataClient";
import { sseManager } from "./sseManager";
import { startExecution } from "./executionService";
import type { AgentProfileSummary, PlanDraft, PlannedTask, RepositorySummary } from "../agents/planning/state";

// ─── Session state ────────────────────────────────────────────────────────────

type Phase = "interview" | "review";

interface Session {
  planId: string;
  projectId: string;
  planTitle: string | null;
  phase: Phase;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  planDraft: PlanDraft | null;
  agentProfiles: AgentProfileSummary[];
  projectRepositories: RepositorySummary[];
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
  const [profiles, repos, existingMessages, existingTasks] = await Promise.all([
    dataClient.getAgentProfiles(),
    dataClient.getProjectRepositories(plan.project_id),
    dataClient.getPlanMessages(planId),
    dataClient.getPlanTasks(planId) as Promise<SavedTask[]>,
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
    const [profiles, repos, existingMessages, existingTasks] = await Promise.all([
      dataClient.getAgentProfiles(),
      dataClient.getProjectRepositories(plan.project_id),
      dataClient.getPlanMessages(planId),
      dataClient.getPlanTasks(planId) as Promise<SavedTask[]>,
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

  const titleContext = session.planTitle ? `\n\nPlan title: "${session.planTitle}"` : "";

  const systemContent =
    BASE_SYSTEM + titleContext +
    `\n\nAvailable agent profiles:\n${profilesText}` +
    `\n\nProject repositories:\n${reposText}` +
    "\n\nAsk ONE focused follow-up question at a time to gather context. " +
    "Set ready_for_plan to true only when you have enough information for a complete plan." +
    STRUCTURED_OUTPUT_INSTRUCTIONS;

  const llmMessages = buildMessageList(session.messages, systemContent);
  const response = await llm.invoke(llmMessages);
  const text = extractText(response).trim();

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
    // Persist draft tasks to DB immediately so they survive page reloads
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

  const systemContent =
    BASE_SYSTEM +
    "\n\nThe user wants to revise the current plan." +
    `\n\nCurrent plan:\n${JSON.stringify(session.planDraft, null, 2)}` +
    `\n\nAvailable agent profiles:\n${profilesText}` +
    `\n\nAvailable repositories:\n${reposText}` +
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
